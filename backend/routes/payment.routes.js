// src/routes/payment.routes.js (Reference)

import express from "express";
import Payment from "../models/payment.model.js";

const router = express.Router();

router.post("/create-order", async (req, res) => {
  const { amount } = req.body;

  const payment = await Payment.create({
    orderId: "PAY_" + Date.now() + Math.floor(Math.random() * 100),
    amount
  });

  res.json({
    orderId: payment.orderId,
    amount: payment.amount
  });
});


router.post("/verify-payment", async (req, res) => {
  const { orderId, status } = req.body;

  const updatedPayment = await Payment.findOneAndUpdate(
    { orderId },
    { status: status },
    { new: true }
  );
  
  if (!updatedPayment) {
    return res.status(404).json({ message: "Payment order ID not found." });
  }

  res.json({ message: "Payment " + status, payment: updatedPayment });
});

export default router;