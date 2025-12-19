// client/src/components/FakeCheckout.jsx
import axios from "axios";
import { useState } from "react";

export default function FakeCheckout() {
  const [order, setOrder] = useState(null);

  const createOrder = async () => {
    const res = await axios.post("http://localhost:5000/api/payment/create-order", {
      amount: 500
    });
    setOrder(res.data);
  };

  const handlePayment = async (status) => {
    await axios.post("http://localhost:5000/api/payment/verify-payment", {
      orderId: order.orderId,
      status
    });
    alert("Payment " + status);
  };

  return (
    <div style={{ padding: "20px", border: "1px solid gray" }}>
      <h2>Fake Payment Gateway</h2>

      {!order ? (
        <button onClick={createOrder}>Pay ₹500</button>
      ) : (
        <>
          <p>Order ID: {order.orderId}</p>
          <button onClick={() => handlePayment("success")}>
            ✔ Success
          </button>
          <button onClick={() => handlePayment("failed")}>
            ✖ Failed
          </button>
        </>
      )}
    </div>
  );
}
