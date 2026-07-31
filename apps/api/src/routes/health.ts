import { Router } from "express";
import { isDBConnected } from "../config/db.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    db: isDBConnected() ? "connected" : "disconnected",
  });
});
