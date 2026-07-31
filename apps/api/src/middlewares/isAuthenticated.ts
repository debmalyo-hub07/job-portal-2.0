import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies.token;
    if (!token) {
      res.status(401).json({
        message: "User not authenticated",
        success: false,
      });
      return;
    }
    const decode = jwt.verify(token, process.env.SECRET_KEY as string) as JwtPayload;
    if (!decode) {
      res.status(401).json({
        message: "Invalid token",
        success: false,
      });
      return;
    }
    req.id = decode.userId;
    next();
  } catch (error) {
    console.log(error);
  }
};
export default isAuthenticated;
