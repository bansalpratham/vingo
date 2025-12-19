import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  orderId: String,
  amount: Number,
  status: {
    type: String,
    enum: ["created", "success", "failed"],
    default: "created"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Payment", paymentSchema);