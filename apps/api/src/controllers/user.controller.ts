import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import getDataUri from "../utils/datauri.js";
import cloudinary from "../utils/cloudinary.js";

export const register = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { fullname, email, phoneNumber, password, role } = req.body;

    if (!fullname || !email || !phoneNumber || !password || !role) {
      return res.status(400).json({
        message: "Something is missing",
        success: false,
      });
    }
    const file = req.file as Express.Multer.File;
    const fileUri = getDataUri(file);
    const cloudResponse = await cloudinary.uploader.upload(fileUri.content as string);

    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        message: "User already exist with this email.",
        success: false,
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      fullname,
      email,
      phoneNumber,
      password: hashedPassword,
      role,
      profile: {
        profilePhoto: cloudResponse.secure_url,
      },
    });

    return res.status(201).json({
      message: "Account created successfully.",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const login = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        message: "Something is missing",
        success: false,
      });
    }
    const foundUser = await User.findOne({ email });
    if (!foundUser) {
      return res.status(400).json({
        message: "Incorrect email or password.",
        success: false,
      });
    }
    const isPasswordMatch = await bcrypt.compare(password, foundUser.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Incorrect email or password.",
        success: false,
      });
    }
    // check role is correct or not
    if (role !== foundUser.role) {
      return res.status(400).json({
        message: "Account doesn't exist with current role.",
        success: false,
      });
    }

    const tokenData = {
      userId: foundUser._id,
    };
    const token = jwt.sign(tokenData, process.env.SECRET_KEY as string, {
      expiresIn: "1d",
    });

    const user = {
      _id: foundUser._id,
      fullname: foundUser.fullname,
      email: foundUser.email,
      phoneNumber: foundUser.phoneNumber,
      role: foundUser.role,
      profile: foundUser.profile,
    };

    return res
      .status(200)
      .cookie("token", token, {
        maxAge: 1 * 24 * 60 * 60 * 1000,
        httpsOnly: true,
        sameSite: "strict",
      } as never)
      .json({
        message: `Welcome back ${user.fullname}`,
        user,
        success: true,
      });
  } catch (error) {
    console.log(error);
  }
};

export const logout = async (_req: Request, res: Response): Promise<Response | void> => {
  try {
    return res.status(200).cookie("token", "", { maxAge: 0 }).json({
      message: "Logged out successfully.",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { fullname, email, phoneNumber, bio, skills } = req.body;

    const file = req.file as Express.Multer.File;
    const fileUri = getDataUri(file);
    const cloudResponse = await cloudinary.uploader.upload(fileUri.content as string);

    let skillsArray: string[] | undefined;
    if (skills) {
      skillsArray = skills.split(",");
    }
    const userId = req.id; // middleware authentication
    const foundUser = await User.findById(userId);

    if (!foundUser) {
      return res.status(400).json({
        message: "User not found.",
        success: false,
      });
    }
    // updating data
    if (fullname) foundUser.fullname = fullname;
    if (email) foundUser.email = email;
    if (phoneNumber) foundUser.phoneNumber = phoneNumber;

    // `profile` is typed optional because the schema declares no `required` on
    // the nested path, but Mongoose materialises nested objects on every
    // document, so it is present in practice. Asserting rather than guarding
    // keeps this migration behaviour-identical; Phase 1C replaces this model.
    const profile = foundUser.profile!;
    if (bio) profile.bio = bio;
    if (skills && skillsArray) profile.skills = skillsArray;

    // resume comes later here...
    if (cloudResponse) {
      profile.resume = cloudResponse.secure_url; // save the cloudinary url
      profile.resumeOriginalName = file.originalname; // Save the original file name
    }

    await foundUser.save();

    const user = {
      _id: foundUser._id,
      fullname: foundUser.fullname,
      email: foundUser.email,
      phoneNumber: foundUser.phoneNumber,
      role: foundUser.role,
      profile: foundUser.profile,
    };

    return res.status(200).json({
      message: "Profile updated successfully.",
      user,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};
