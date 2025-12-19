import express from 'express'
import { getcurrentUser, updateUserLocation } from '../controllers/user.controller.js';
import isAuth from '../middlewares/isAuth.js';

const userRouter = express.Router();

userRouter.get("/current" ,isAuth, getcurrentUser)
userRouter.post("/update-location" ,isAuth,updateUserLocation)

export default userRouter