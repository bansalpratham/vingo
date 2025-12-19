import mongoose from "mongoose"
import Order from "../models/order.model.js"
import Shop from "../models/shop.model.js"
import User from "../models/user.model.js"
import DeliveryAssignment from "../models/deliveryAssignment.model.js"
import { sendDeliveryOtpMail } from "../utils/mail.js"
import Payment from "../models/payment.model.js" // <-- ADD THIS IMPORT

export const placeOrder = async (req, res) => {
    try {
        const { cartItems, paymentMethod, deliveryAddress, totalAmount, paymentId } = req.body

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({
                message: "cart is empty"
            })
        }
        if (!deliveryAddress.text || !deliveryAddress.latitude || !deliveryAddress.longitude) {
            return res.status(400).json({
                message: "send complete deliveryAddress"
            })
        }

        let finalPaymentId = null;
        if (paymentMethod === 'online') {
            if (!paymentId) {
                return res.status(400).json({
                    message: "Online payment selected but payment ID is missing."
                });
            }

            const paymentRecord = await Payment.findOne({ orderId: paymentId });

            if (!paymentRecord || paymentRecord.status !== 'success') {
                return res.status(400).json({
                    message: "Payment verification failed. Status is not success."
                });
            }
            finalPaymentId = paymentId;
        }

        const groupItemsByShop = {}

        cartItems.forEach(item => {
            const shopId = item.shop
            if (!groupItemsByShop[shopId]) {
                groupItemsByShop[shopId] = []
            }
            groupItemsByShop[shopId].push(item)
        });

        const shopOrders = await Promise.all(Object.keys(groupItemsByShop).map(async (shopId) => {
            const shop = await Shop.findById(shopId).populate("owner")

            if (!shop) {
                throw new Error("shop not found for ID: " + shopId);
            }
            if (!shop.owner || !shop.owner._id) {
                throw new Error("Shop owner not found or populated for shop: " + shop.name);
            }

            const items = groupItemsByShop[shopId]
            const subtotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0)
            return {
                shop: shop._id,
                owner: shop.owner._id,
                subtotal,
                shopOrderItems: items.map((i) => ({
                    item: i.id,
                    price: i.price,
                    quantity: i.quantity,
                    name: i.name
                }))
            }
        }))


        const newOrder = await Order.create({
            user: req.userId,
            paymentMethod,
            onlinePaymentRef: finalPaymentId,
            deliveryAddress,
            totalAmount,
            shopOrders
        })

        await newOrder.populate("shopOrders.shopOrderItems.item", "name image price")
        await newOrder.populate({
            path: "shopOrders.owner",
            select: "socketId"
        });
        await newOrder.populate("shopOrders.shop", "name");
        await newOrder.populate("user", "fullName email mobile");

        const io = req.app.get('io')

        if (io) {
            newOrder.shopOrders.forEach(shopOrder => {
                const ownerSocketId = shopOrder.owner?.socketId;
                if (ownerSocketId) {
                    io.to(ownerSocketId).emit('newOrder', {
                        _id: newOrder._id,
                        paymentMethod: newOrder.paymentMethod,
                        user: newOrder.user,
                        deliveryAddress: newOrder.deliveryAddress,
                        totalAmount: newOrder.totalAmount,
                        createdAt: newOrder.createdAt,
                        shopOrder: shopOrder
                    });
                }
            });
        }


        return res.status(201).json(newOrder)

    } catch (error) {
        console.error("Critical Place Order Error:", error.message);
        return res.status(500).json({
            message: `place order error: ${error.message}`
        })
    }
}


export const getMyOrders = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        let orders = [];

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role === "owner") {
            const ownerId = req.userId;
            const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

            orders = await Order.aggregate([
                { $match: { "shopOrders.owner": ownerObjectId } },
                {
                    $project: {
                        user: 1,
                        paymentMethod: 1,
                        deliveryAddress: 1,
                        totalAmount: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        shopOrders: {
                            $filter: {
                                input: "$shopOrders",
                                as: "shopOrder",
                                cond: { $eq: ["$$shopOrder.owner", ownerObjectId] }
                            }
                        }
                    }
                },
                { $sort: { createdAt: -1 } }
            ]);


        } else {

            orders = await Order.find({ user: req.userId })
                .sort({ createdAt: -1 })
                .lean();
        }

        const populatedOrders = await Order.populate(orders, [
            { path: "shopOrders.shop", select: "name" },
            { path: "user", select: "fullName email mobile" },
            { path: "shopOrders.shopOrderItems.item", select: "name image price" },
            { path: "shopOrders.assignedDeliveryBoy", select: "fullName mobile" }
        ]);

        if (user.role === "owner") {
            const filterOrders = populatedOrders.map(order => {
                const relevantShopOrder = order.shopOrders[0];

                return {
                    _id: order._id,
                    paymentMethod: order.paymentMethod,
                    user: order.user,
                    deliveryAddress: order.deliveryAddress,
                    totalAmount: order.totalAmount,
                    createdAt: order.createdAt,
                    shopOrder: {
                        ...relevantShopOrder,
                        shopOrderItems: relevantShopOrder.shopOrderItems
                    },
                };
            });

            return res.status(200).json(filterOrders);

        } else {
            return res.status(200).json(populatedOrders);
        }

    } catch (error) {
        console.error("Critical getMyOrders Error:", error);
        return res.status(500).json({
            message: `get user order error: ${error.message}`
        })
    }
}

export const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, shopId } = req.params
        const { status } = req.body

        const order = await Order.findById(orderId)

        const shopOrder = order.shopOrders.find(o => String(o.shop) === shopId)

        if (!shopOrder) {
            return res.status(400).json({ message: "shop order not found" })
        }

        shopOrder.status = status

        let deliveryBoysPayload = []
        let responseMessage = `Order status updated to ${status}.`

        if (status === "out of delivery" && !shopOrder.assignment) {
            const { longitude, latitude } = order.deliveryAddress

            const nearByDeliveryBoys = await User.find({
                role: "deliveryBoy",
                location: {
                    $near: {
                        $geometry: { type: "Point", coordinates: [Number(longitude), Number(latitude)] },
                        $maxDistance: 5000
                    }
                }
            })

            const nearbyIds = nearByDeliveryBoys.map(b => b._id)

            const busyIds = await DeliveryAssignment.find({
                assignedTo: { $in: nearbyIds },
                status: { $nin: ["broadcasted", "completed"] }
            }).distinct("assignedTo")

            const busyIdSet = new Set(busyIds.map(id => String(id)))

            const availableBoys = nearByDeliveryBoys.filter(b => !busyIdSet.has(String(b._id)))
            const candidates = availableBoys.map(b => b._id)

            if (candidates.length === 0) {
                responseMessage = "Order status updated but there is no available delivery boy nearby."
                shopOrder.assignedDeliveryBoy = null
                shopOrder.assignment = null
            }
            else {
                responseMessage = "Order status updated and delivery assignment broadcasted."

                const deliveryAssignment = await DeliveryAssignment.create({
                    order: order._id,
                    shop: shopOrder.shop,
                    shopOrderId: shopOrder._id,
                    broadcastedTo: candidates,
                    status: "broadcasted"
                })

                shopOrder.assignedDeliveryBoy = deliveryAssignment.assignedTo
                shopOrder.assignment = deliveryAssignment._id

                deliveryBoysPayload = availableBoys.map(b => ({
                    id: b._id,
                    fullName: b.fullName,
                    longitude: b.location.coordinates?.[0],
                    latitude: b.location.coordinates?.[1],
                    mobile: b.mobile
                }))

                await deliveryAssignment.populate("order")
                await deliveryAssignment.populate("shop")

                const io = req.app.get('io')
                if (io) {
                    availableBoys.forEach(boy => {
                        const boySocketId = boy.socketId
                        if (boySocketId) {
                            io.to(boySocketId).emit('newAssignment', {
                                sentTo: boy._id,
                                assignmentId: deliveryAssignment._id,
                                orderId: deliveryAssignment.order._id,
                                shopName: deliveryAssignment.shop.name,
                                deliveryAddress: deliveryAssignment.order.deliveryAddress,
                                items: deliveryAssignment.order.shopOrders.find(so => so._id.equals(deliveryAssignment.shopOrderId)).shopOrderItems || [],
                                subtotal: deliveryAssignment.order.shopOrders.find(so => so._id.equals(deliveryAssignment.shopOrderId))?.subtotal
                            })
                        }
                    })
                }
            }
        }

        await shopOrder.save()
        await order.save()

        const updatedShopOrder = order.shopOrders.find(o => String(o.shop) === shopId)
        await order.populate("shopOrders.shop", "name")
        await order.populate("shopOrders.assignedDeliveryBoy", "fullName email mobile")
        await order.populate("user", "socketId")

        const io = req.app.get('io')
        if (io) {
            const userSocketId = order.user.socketId
            if (userSocketId) {
                io.to(userSocketId).emit('update-status', {
                    orderId: order._id,
                    shopId: updatedShopOrder.shop._id,
                    status: updatedShopOrder.status,
                    userId: order.user._id
                })
            }
        }


        return res.status(200).json({
            message: responseMessage,
            shopOrder: updatedShopOrder,
            assignedDeliveryBoy: updatedShopOrder?.assignedDeliveryBoy,
            availableBoys: deliveryBoysPayload,
            assignment: updatedShopOrder?.assignment,
        })

    } catch (error) {
        return res.status(500).json({
            message: `order status error: ${error.message}`
        })
    }
}

export const getDeliveryBoyAssignment = async (req, res) => {
    try {
        const deliveryBoyId = req.userId
        const assignments = await DeliveryAssignment.find({
            broadcastedTo: deliveryBoyId,
            status: "broadcasted"
        })
            .populate("order")
            .populate("shop")

        const formated = assignments.map(a => ({
            assignmentId: a._id,
            orderId: a.order._id,
            shopName: a.shop.name,
            deliveryAddress: a.order.deliveryAddress,
            items: a.order.shopOrders.find(so => so._id.equals(a.shopOrderId)).shopOrderItems || [],
            subtotal: a.order.shopOrders.find(so => so._id.equals(a.shopOrderId))?.subtotal
        }))

        return res.status(200).json(formated)

    } catch (error) {
        return res.status(500).json({
            message: `get assignment error: ${error.message}`
        })
    }
}

export const acceptOrder = async (req, res) => {
    try {
        const { assignmentId } = req.params
        const assignment = await DeliveryAssignment.findById(assignmentId)
        if (!assignment) {
            return res.status(400).json({
                message: "assignment not found"
            })
        }

        if (assignment.status !== "broadcasted") {
            return res.status(400).json({
                message: "assignment is expired"
            })
        }

        const alreadyAssigned = await DeliveryAssignment.findOne({
            assignedTo: req.userId,
            status: { $nin: ["broadcasted", "completed"] }
        })

        if (alreadyAssigned) {
            return res.status(400).json({
                message: "You are already assigned to another order"
            })
        }

        assignment.assignedTo = req.userId
        assignment.status = "assigned"
        assignment.acceptedAt = new Date()
        await assignment.save()

        const order = await Order.findById(assignment.order)
        if (!order) {
            return res.status(400).json({
                message: "order not found"
            })
        }

        const shopOrder = order.shopOrders.find(
            so => so._id.equals(assignment.shopOrderId)
        )

        if (!shopOrder) {
            return res.status(400).json({
                message: "shop order not found"
            });
        }
        shopOrder.assignedDeliveryBoy = req.userId
        await order.save()

        return res.status(200).json({
            message: "order accepted"
        })

    } catch (error) {
        return res.status(500).json({
            message: `accept error: ${error.message}`
        })
    }
}

export const getCurrentOrder = async (req, res) => {
    try {
        const assignment = await DeliveryAssignment.findOne({
            assignedTo: req.userId,
            status: "assigned"
        })
            .populate("shop", "name")
            .populate("assignedTo", "fullName email mobile location")
            .populate({
                path: "order",
                populate: [{ path: "user", select: "fullName email location mobile" }]
            })

        if (!assignment) {
            return res.status(400).json({
                message: "assignment not found"
            })
        }

        if (!assignment.order) {
            return res.status(400).json({
                message: "order not found"
            })
        }

        const shopOrder = assignment.order.shopOrders.find(so => String(so._id) == String(assignment.shopOrderId))

        if (!shopOrder) {
            return res.status(400).json({
                message: "shopOrder not found"
            })
        }

        let deliveryBoyLocation = { lat: null, lon: null }
        if (assignment.assignedTo.location.coordinates.length == 2) {
            deliveryBoyLocation.lat = assignment.assignedTo.location.coordinates[1]
            deliveryBoyLocation.lon = assignment.assignedTo.location.coordinates[0]
        }
        let customerLocation = { lat: null, lon: null }
        if (assignment.order.deliveryAddress) {
            customerLocation.lat = assignment.order.deliveryAddress.latitude
            customerLocation.lon = assignment.order.deliveryAddress.longitude
        }

        return res.status(200).json({
            _id: assignment.order._id,
            user: assignment.order.user,
            shopOrder,
            deliveryAddress: assignment.order.deliveryAddress,
            deliveryBoyLocation,
            customerLocation
        })

    } catch (error) {
        return res.status(500).json({
            message: `current order error: ${error.message}`
        })
    }
}

export const getOrderById = async (req, res) => {
    try {
        const { orderId } = req.params
        const order = await Order.findById(orderId)
            .populate("user")
            .populate({
                path: "shopOrders.shop",
                model: "Shop"
            })
            .populate({
                path: "shopOrders.assignedDeliveryBoy",
                model: "User"
            })
            .populate({
                path: "shopOrders.shopOrderItems.item",
                model: "Item"
            })
            .lean()

        if (!order) {
            return res.status(400).json({
                message: "order not found"
            })
        }

        return res.status(200).json(order)

    } catch (error) {
        return res.status(500).json({
            message: `get by id order error : ${error.message}`
        })
    }
}

export const sendDeliveryOtp = async (req, res) => {
    try {
        const { orderId, shopOrderId } = req.body
        const order = await Order.findById(orderId).populate("user")
        const shopOrder = order.shopOrders.id(shopOrderId)

        if (!order || !shopOrder) {
            return res.status(400).json({
                message: "enter valid order/shop"
            })
        }
        const otp = Math.floor(1000 + Math.random() * 9000).toString()
        shopOrder.deliveryOtp = otp
        shopOrder.otpExpires = Date.now() + 5 * 60 * 1000
        await order.save()
        await sendDeliveryOtpMail(order.user, otp)
        return res.status(200).json({
            message: `Otp sent Successfully to ${order?.user?.fullName} `
        })
    } catch (error) {
        return res.status(500).json({
            message: `delivery otp error : ${error.message}`
        })
    }
}

export const verifyDeliveryOtp = async (req, res) => {
    try {
        const { orderId, shopOrderId, otp } = req.body
        const order = await Order.findById(orderId).populate("user")
        const shopOrder = order.shopOrders.id(shopOrderId)
        if (!order || !shopOrder) {
            return res.status(400).json({
                message: "enter valid order/shop"
            })
        }
        if (shopOrder.deliveryOtp != otp || !shopOrder.otpExpires || shopOrder.otpExpires < Date.now()) {
            return res.status(400).json({
                message: "Inavlid/Expired Otp"
            })
        }

        shopOrder.status = "delivered"
        shopOrder.deliveredAt = Date.now()
        await order.save()
        await DeliveryAssignment.deleteOne({
            shopOrderId: shopOrder._id,
            order: order._id,
            assignedTo: shopOrder.assignedDeliveryBoy
        })

        return res.status(200).json({
            message: "Order Delivered Successfully!"
        })

    } catch (error) {
        return res.status(500).json({
            message: `verify delivery otp error : ${error.message}`
        })
    }
}

export const getTodayDeliveries = async (req, res) => {
    try {
        const deliveryBoyId = req.userId
        const startsOfDay = new Date()
        startsOfDay.setHours(0,0,0,0)

        const orders = await Order.find({
            "shopOrders.assignedDeliveryBoy":deliveryBoyId,
            "shopOrders.status":"delivered",
            "shopOrders.deliveredAt":{$gte:startsOfDay}
        }).lean()

        let todaysDeliveries = []

        orders.forEach(order=>{
            order.shopOrders.forEach(shopOrder=>{
               if (shopOrder.assignedDeliveryBoy.toString() === deliveryBoyId.toString() && shopOrder.status=="delivered" && shopOrder.deliveredAt && shopOrder.deliveredAt>=startsOfDay)
                {
                 todaysDeliveries.push(shopOrder)
                } 
            })
        })

        let stats = {}

        todaysDeliveries.forEach(shopOrder=>{
            const hour = new Date(shopOrder.deliveredAt).getHours()
            stats[hour] = (stats[hour] || 0) + 1
        })

        let formattedStats = Object.keys(stats).map(hour=>({
            hour:parseInt(hour),
            count:stats[hour]
        }))

        formattedStats.sort((a,b)=>a.hour-b.hour)

        return res.status(200).json(formattedStats)

    } catch (error) {
        return res.status(500).json({
            message: `today deliveries error : ${error.message}`
        })
    }
}