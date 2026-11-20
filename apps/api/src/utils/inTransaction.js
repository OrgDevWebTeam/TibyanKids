import mongoose from "mongoose";

// Runs `work(session)` as one transaction: everything it saves is kept, or none of it is.
// Needs a MongoDB replica set.
export async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
