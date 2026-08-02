import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";

let mongo: MongoMemoryServer;

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_PEPPER = "test-refresh-pepper-at-least-32-chars!";
process.env.OTP_PEPPER = "test-otp-pepper-at-least-32-characters!!";
process.env.CSRF_SECRET = "test-csrf-secret-at-least-32-characters";
process.env.CLIENT_URLS = "http://localhost:5173";
process.env.API_BASE_URL = "http://localhost:8000";
process.env.WEB_BASE_URL = "http://localhost:5173";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.BREVO_API_KEY = "test";
process.env.BREVO_SENDER_EMAIL = "no-reply@example.com";
process.env.GOOGLE_CLIENT_ID = "test";
process.env.GOOGLE_CLIENT_SECRET = "test";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
