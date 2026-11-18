import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { randomBytes } from "node:crypto";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

let mongod;

export async function connectTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
  await mongod.stop();
}
