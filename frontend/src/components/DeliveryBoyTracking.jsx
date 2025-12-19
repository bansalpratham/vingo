import React from 'react'
import scooter from "../assets/scooter.png"
import home from "../assets/home.png"
import L, { Popup } from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapContainer, Marker, TileLayer } from 'react-leaflet'

const deliveryBoyIcon = new L.Icon({
    iconUrl: scooter,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
})
const customerIcon = new L.Icon({
    iconUrl: home,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
})

function DeliveryBoyTracking({ data }) {
    const deliveryBoyLat = data.deliveryBoyLocation.lat
    const deliveryBoyLon = data.deliveryBoyLocation.lon
    const customerLat = data.customerLocation.lat
    const customerLon = data.customerLocation.lon

    const path = [
        [deliveryBoyLat, deliveryBoyLon],
        [customerLat, customerLon]
    ]

    const centre = [deliveryBoyLat, deliveryBoyLon]

    return (
        <div className='w-full h-[400px] mt-3 rounded-xl overflow-hidden shadow-md'>
            <MapContainer
                className={"w-full h-full"}
                center={centre}
                zoom={16}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[deliveryBoyLat,deliveryBoyLon]} icon={deliveryBoyIcon}>
            
                </Marker>
                <Marker position={[customerLat,customerLon]} icon={customerIcon}>
                
                </Marker>

            </MapContainer>
        </div>
    )
}

export default DeliveryBoyTracking
