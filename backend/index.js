import express from 'express';
import connectDb from './config/db.js';
import dotenv from 'dotenv'
dotenv.config();
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import cors from 'cors'
import userRouter from './routes/user.routes.js';
import shopRouter from './routes/shop.routes.js';
import itemRouter from './routes/item.routes.js';
import orderRouter from './routes/order.routes.js';
import paymentRouter from "./routes/payment.routes.js";
import http from "http"
import { Server } from 'socket.io';
import { socketHandler } from './socket.js';


const app = express();
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "*",
        credentials: true
    },
    methods: ['POST', 'GET']
});

app.set("io",io)


const port = process.env.PORT || 5000;

app.use(cors({
    origin: "*",
    credentials: true
}))

app.use(express.json())
app.use(cookieParser())

app.use("/api/auth" , authRouter)
app.use("/api/user" , userRouter)
app.use("/api/shop" , shopRouter)
app.use("/api/item" , itemRouter)
app.use("/api/order" , orderRouter)
app.use("/api/payment", paymentRouter);

socketHandler(io)

server.listen(port , ()=>{
    connectDb();
    console.log(`server started at ${port}`)
})