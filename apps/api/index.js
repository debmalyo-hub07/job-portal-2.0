import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import companyRoute from "./routes/company.route.js";
import jobRoute from "./routes/job.route.js";
import applicationRoute from "./routes/application.route.js";

dotenv.config({});

const app = express();

// Middleware
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "16mb" }));
app.use(cookieParser());
const clientOrigin = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
  : "http://localhost:5173";
const corsOptions = {
    origin: clientOrigin,
    credentials: true,
    sameSite: "none",
}
app.use(cors(corsOptions));

const PORT = process.env.PORT || 8000;

app.use("/api/v1/user", userRoute);
app.use("/api/v1/company", companyRoute);
app.use("/api/v1/job", jobRoute);
app.use("/api/v1/application", applicationRoute);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  return res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    success: false,
  });
});

app.use((req, res) => {
  return res.status(404).json({ message: "Route not found", success: false });
});

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server is running at port ${PORT}`);
});