import { json } from "express"
import User from "../models/user.model.js"

export const getcurrentUser = async (req, res) => {
    try {
        const userId = req.userId
        if (!userId) {
            return res.status(400).json({
                message: "userId is not found"
            })
        }
        const user = await User.findById(userId)
        if (!user) {
            return res.status(400).json({
                message: "user is not found"
            })
        }
        return res.status(200).json(user)
    } catch (error) {
        return res.status(500).json({
            message: `get current user error ${error}`
        })
    }
}


export const updateUserLocation = async (req, res) => {
    try {
        const { lat, lon } = req.body

        const longitude = parseFloat(lon)
        const latitude = parseFloat(lat)

        if (isNaN(longitude) || isNaN(latitude)) {
            return res.status(400).json({ message: "Invalid latitude or longitude format provided." });
        }

        const updateOperation = {
            $set: {
                location: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                }
            }
        }

        const user = await User.findByIdAndUpdate(req.userId, updateOperation, { new: true })

        if (!user) {
            return res.status(400).json({
                message: "user is not found"
            })
        }
        return res.status(200).json({
            message: "location updated"
        })

    } catch (error) {
        return res.status(500).json({
            message: `update location ${error}`
        })
    }
}