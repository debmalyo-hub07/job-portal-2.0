import mongoose from "mongoose";

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
