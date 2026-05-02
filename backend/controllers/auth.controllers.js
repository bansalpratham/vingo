import User from "../models/user.model.js"
import bcrypt from 'bcryptjs'
import genToken from "../utils/token.js"
import { sendOtpMail } from "../utils/mail.js"

export const signUp = async(req , res)=>{
try {
    const {fullName , email , password , mobile , role} = req.body
    let user = await User.findOne({email})
    if (user)
    {
        return res.status(400).json({
            message: "User Already exists"
        })
    }

    if (password.length < 6)
    {
       return res.status(400).json({
            message: "password must be atleast 6 characters."
        })
    }

    if (mobile.length < 10)
    {
         return res.status(400).json({
            message: "mobile number must be atleast 10 digits."
        })
    }

    const hashedPassword = await bcrypt.hash(password , 10)

    user = await User.create({
        fullName , 
        email , 
        role , 
        mobile , 
        password: hashedPassword
    })

    const token = await genToken(user._id);
   const isProd = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000
});

    return res.status(201).json(user)

} catch (error) {
   return res.status(500).json(`sign up error ${error}`)
}
}

export const signIn = async(req , res)=>{
try {
    const {email , password} = req.body
    const user = await User.findOne({email})
    if (!user)
    {
        return res.status(400).json({
            message: "User does not exists"
        })
    }

    const isMatch = await bcrypt.compare(password ,user.password)

    if (!isMatch)
    {
         return res.status(400).json({
            message: "Incorrect Password"
        })
    }

    const token = await genToken(user._id);
   const isProd = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000
});

    return res.status(200).json(user)

} catch (error) {
   return res.status(500).json(`sign In error ${error}`)
}
}

export const signOut = async(req,res)=>{
    try {
        res.clearCookie("token");
        res.status(200).json({
            message: "log out successfully"
        })
    } catch (error) {
         return res.status(500).json(`sign Out error ${error}`)
    }
}

export const sendOtp = async(req,res)=>{
    try {
        const {email} = req.body
        const user = await User.findOne({email});

        if (!user)
        {
            return res.status(400).json({
            message: "User does not exists"
        })
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString()
        user.resetOtp = otp;
        user.otpExpires = Date.now() + 5*60*1000
        user.isOtpVerified = false
        await user.save()
      await sendOtpMail(email , otp)
     return res.status(200).json({
        message: "otp sent successfully"
      })
    } catch (error) {
        return res.status(500).json(`send otp error ${error}`)
    }
}

export const verifyOtp = async (req,res)=>{
    try {
        const {email , otp} = req.body
          const user = await User.findOne({email});

        if (!user || user.resetOtp!=otp || user.otpExpires < Date.now())
        {
            return res.status(400).json({
            message: "Invalid/expired otp"
        })
        }
        user.isOtpVerified = true
        user.resetOtp = undefined
        user.otpExpires = undefined
        await user.save()
        return res.status(200).json({
            message:"otp verify successfully"
        })
    } catch (error) {
         return res.status(500).json(`verify otp error ${error}`)
    }
}

export const resetPassword = async (req,res)=>{
try {
    const {email , newPassword} = req.body
     const user = await User.findOne({email});

        if (!user || !user.isOtpVerified)
        {
            return res.status(400).json({
            message: "otp verification "
        })
        }

        const hashedPassword = await bcrypt.hash(newPassword , 10);

        user.password = hashedPassword;
        user.isOtpVerified = false
        await user.save();
        return res.status(200).json({
            message:"passport reset successfully successfully"
        })
} catch (error) {
    return res.status(500).json(`reset password error ${error}`)
}
}

export const googleAuth = async(req,res) =>{
    try {
        const {fullName , email , mobile , role} = req.body
        let user = await User.findOne({email})
        if (!user)
        {
            user = await User.create({
                fullName ,
                email,
                mobile,
                role
            })
        }
        const token = await genToken(user._id);
        const isProd = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000
});

      return res.status(200).json(user)

    } catch (error) {
            return res.status(500).json(`googleAuth ${error}`)
    }
}