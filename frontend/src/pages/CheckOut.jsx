import React, { useEffect, useState } from 'react'
import { IoMdArrowBack } from "react-icons/io";
import { FaLocationDot, FaCreditCard } from "react-icons/fa6"; 
import { FaSearch } from "react-icons/fa";
import { BiCurrentLocation } from "react-icons/bi";
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { useDispatch, useSelector } from 'react-redux';
import "leaflet/dist/leaflet.css" 
import { setAddress, setLocation } from '../redux/mapSlice';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { serverUrl } from '../config';
import { FaMobileAlt } from "react-icons/fa";
import { MdDeliveryDining } from "react-icons/md";
import { addMyOrder } from '../redux/user.slice';

function RecentreMap({location}){
    if (location.lat &&location.lon)
    {
        const map = useMap()
        map.setView([location.lat,location.lon],16,{animate:true})
    }
    return null
}

function CheckOut() {
    const navigate = useNavigate();
    const {location,address} = useSelector(state=>state.map)
    const {cartItems , totalAmount,userData} = useSelector(state=>state.user)
    
    // --- State for Payment Simulation ---
    const [addressInput,setAddressInput] = useState("")
    const [paymentMethod,setPaymentMethod] = useState("cod")
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [dbPaymentId, setDbPaymentId] = useState(null); // Backend-generated Payment Order ID
    const [isProcessing, setIsProcessing] = useState(false); // Global loading state
    // ------------------------------------

    const dispatch = useDispatch()
    const apiKey = import.meta.env.VITE_GEOAPIKEY
    const deliveryFee = totalAmount > 500?0:40
    const AmountWithDeliveryFee = totalAmount + deliveryFee

    const onDragEnd = (e)=>{
        const {lat,lng} = e.target._latlng
        dispatch(setLocation({ lat, lon: lng }))
        getAddressByLatLng(lat,lng)
    }

    const getCurrentLocation = ()=>{ 
        const latitude = userData.location.coordinates[1]
        const longitude = userData.location.coordinates[0]
        dispatch(setLocation({lat:latitude,lon:longitude}))
        getAddressByLatLng(latitude,longitude)
    }

    const getAddressByLatLng = async(lat,lng)=>{
        try {
            const result = await axios.get(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${apiKey}`)
            dispatch(setAddress(result?.data?.results[0].address_line2))
            } catch (error) {
            console.log(error)
        }
    }

    const getLatLngByAddress = async()=>{
        try {
            const result = await axios.get(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(addressInput)}&apiKey=${apiKey}`)
            const {lat,lon} = result.data.features[0].properties
            dispatch(setLocation({lat,lon})) 
        } catch (error) {
            console.log(error)    
        }    
    }

    // --- Core Logic: Step 1 (Start Payment) ---
    const openFakePaymentGateway = async () => {
        try {
            // 1a. Call backend to create a 'created' payment record
            const response = await axios.post(`${serverUrl}/api/payment/create-order`, {
                amount: AmountWithDeliveryFee
            });

            // 1b. Store the official orderId
            setDbPaymentId(response.data.orderId);
            
            // 1c. Open the simulation modal
            setShowPaymentModal(true);

        } catch (error) {
            console.error("Error creating fake payment order:", error);
            alert("Could not start payment. Please check console.");
        }
    };

    // --- Core Logic: Step 2 (Handle Payment Result) ---
    const handleFakePayment = async (status) => {
        setShowPaymentModal(false);
        setIsProcessing(true); // Start general loading for the whole process
        
        try {
            // 2a. Update the payment status on the backend
            await axios.post(`${serverUrl}/api/payment/verify-payment`, {
                orderId: dbPaymentId,
                status: status // 'success' or 'failed'
            });

            if (status === "success") {
                // 2b. If successful, proceed to place the main food order
                await handlePlaceOrder();
            } else {
                // If failed, just show a message and clear the loading state
                alert("Payment Failed. Please try again or choose COD.");
                setIsProcessing(false);
            }
        } catch (error) {
            console.error("Error verifying fake payment:", error);
            alert("An error occurred during payment verification.");
            setIsProcessing(false);
        }
        setDbPaymentId(null); // Clear ID after transaction attempt
    };


    // --- Core Logic: Step 3 (Place Final Order) ---
    const handlePlaceOrder = async()=>{
        try {
            const result = await axios.post(`${serverUrl}/api/order/place-order`,{
                paymentMethod,
                // **IMPORTANT: Pass the payment ID if it was an online order**
                paymentId: paymentMethod === "online" ? dbPaymentId : null, 
                // -----------------------------------------------------------
                deliveryAddress: {
                    text: addressInput,
                    latitude : location.lat,
                    longitude : location.lon
                },
                totalAmount: AmountWithDeliveryFee, // Use total amount with fee for final order
                cartItems
            },{withCredentials: true})
            
            dispatch(addMyOrder(result.data))
            setIsProcessing(false);
            navigate("/order-placed")
        } catch (error) {
            console.log(error)
        } finally {
            setIsProcessing(false); // Stop loading regardless of success/fail
        }
    }

    useEffect(()=>{
        setAddressInput(address)
    },[address])

    return (
        <div className='min-h-screen bg-[#fff9f6] flex items-center justify-center p-6'>
            <div className='absolute top-[20px] left-[20px] z-[10]' onClick={()=>navigate("/")}>
                <IoMdArrowBack size={35} className='text-[#ff4d2d]' />
            </div>
            <div className='w-full max-w-[900px] bg-white rounded-2xl shadow-xl p-6 space-y-6'>
                <h1 className='text-2xl font-bold text-gray-800'>CheckOut</h1>
                
                {/* --- Delivery Location Section (Retained) --- */}
                <section>
                    <h2 className='text-lg font-semibold mb-2 flex items-center gap-2 text-gray-800'><FaLocationDot className='text-[#ff4d2d]' />Delivery Location</h2>
                    <div className='flex gap-2 mb-3'>
                        <input type="text" className='flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff4d2d]' placeholder='Enter your Delivery Address...' value={addressInput} onChange={(e)=>setAddressInput(e.target.value)} />
                        <button className='bg-[#ff4d2d] hover:bg-[#e64526] text-white px-3 py-2 rounded-lg flex items-center justify-center' onClick={getLatLngByAddress} ><FaSearch  size={17}/></button>
                        <button className='bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg flex items-center justify-center' onClick={(getCurrentLocation)} ><BiCurrentLocation size={17} /></button>
                    </div>
                    <div className='rounded-xl border overflow-hidden'>
                    <div className='h-64 w-full flex items-center justify-center'>
                        <MapContainer 
                        className={"w-full h-full"}
                        center={[location?.lat,location?.lon]}
                        zoom={16}
                        >
                            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />  
                <RecentreMap location={location}/>
                <Marker position={[location?.lat,location?.lon]} draggable eventHandlers={{dragend:onDragEnd}}  />
                        </MapContainer>
                    </div>
                    </div>
                </section>

                {/* --- Payment Method Section --- */}
                <section>
                    <h2 className='text-lg font-semibold mb-3 text-gray-800'>Payment Method</h2>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        <div className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                            paymentMethod == "cod" ? "border-[#ff4d2d] bg-orange-50 shadow":"border-gray-200 hover:border-gray-300"
                        }`} onClick={()=>setPaymentMethod("cod")}>
                            <span className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100'>
                            <MdDeliveryDining className='text-green-600 text-xl' />
                            </span>
                            <div>
                                <p className='font-medium text-gray-800'>Cash On Delivery</p>
                                <p className='text-xs text-gray-500'>Pay when your food arrives</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                            paymentMethod == "online" ? "border-[#ff4d2d] bg-orange-50 shadow":"border-gray-200 hover:border-gray-300"
                        }`} onClick={()=>setPaymentMethod("online")}>
                            <span className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-100'><FaMobileAlt className='text-purple-700 text-lg' /></span>
                            <span className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-100'><FaCreditCard className='text-purple-700 text-lg' /></span>
                            <div>
                                <p className='font-medium text-gray-800'>UPI / Credit / Debit Card</p>
                                <p className='text-xs text-gray-500'>Pay Securely Online</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- Order Summary Section (Retained) --- */}
                <section>
                    <h2 className='text-lg font-semibold mb-3 text-gray-800'>Order Summary</h2>
                    <div className='rounded-xl border bg-gray-50 p-4 space-y-2'>
                        {cartItems.map((item,index)=>(
                            <div key={index} className='flex justify-between text-sm text-gray-700' >
                            <span>{item.name} x {item.quantity}</span>
                            <span> ₹{item.price * item.quantity}</span>
                            </div>
                        ))}
                        <hr className='border-gray-200 my-2' />
                        <div className='flex justify-between font-medium text-gray-800'>
                            <span>Subtotal</span>
                            <span>₹{totalAmount}</span>
                        </div>
                        <div className='flex justify-between text-gray-700'>
                            <span>Delivery Fee</span>
                            <span>₹{deliveryFee==0?"Free":deliveryFee}</span>
                        </div>
                        <div className='flex justify-between text-lg font-bold text-[#ff4d2d] pt-2'>
                            <span>Total</span>
                            <span>₹{AmountWithDeliveryFee}</span>
                        </div>
                    </div>
                </section>

                {/* --- Final Place Order Button --- */}
                <button
                    className={`w-full text-white py-3 rounded-xl font-semibold transition ${
                        isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#ff4d2d] hover:bg-[#e64526]'
                    }`}
                    onClick={() => {
                        if (isProcessing) return; 
                        if (paymentMethod === "cod") {
                            handlePlaceOrder();
                        } else {
                            openFakePaymentGateway();
                        }
                    }}
                    disabled={isProcessing}
                >
                    {isProcessing ? "Processing Order..." : (paymentMethod === "cod" ? "Place Order" : `Pay ₹${AmountWithDeliveryFee} & Place Order`)}
                </button>
            </div>
            
            {/* --- Payment Simulation Modal (Final UI) --- */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg space-y-6 transform transition-all duration-300 scale-100">
                        <h2 className="text-2xl font-extrabold text-[#ff4d2d] text-center border-b pb-3">
                            💳 Payment Gateway Simulation
                        </h2>

                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-500 flex justify-between">
                                Merchant: <span className='text-gray-800 font-semibold'>FoodApp Demo</span>
                            </p>
                            <p className="text-sm font-medium text-gray-500 flex justify-between">
                                Payment Order ID: <span className='text-gray-800 font-semibold'>{dbPaymentId}</span>
                            </p>
                            <div className='h-px bg-gray-200'></div>
                            <p className="text-3xl font-bold text-center text-green-600 pt-2">
                                ₹{AmountWithDeliveryFee}
                            </p>
                        </div>

                        <p className="text-center text-sm text-gray-700">
                            (This is a development simulator. Select a result to continue.)
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold transition shadow-md"
                                onClick={() => handleFakePayment("success")}
                            >
                                <span className='mr-2'>✅</span> Simulate Success
                            </button>

                            <button
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition shadow-md"
                                onClick={() => handleFakePayment("failed")}
                            >
                                <span className='mr-2'>❌</span> Simulate Failure
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default CheckOut