import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI: string = process.env.MONGO_URI!;

let cached: {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
} = {
	conn: null,
	promise: null
};

export default async function dbConnect() {
	if (cached.conn) return cached.conn;

	if (!cached.promise) {
		cached.promise = mongoose.connect(MONGO_URI!, {
			serverSelectionTimeoutMS: 30000 // optional
		});
	}

	cached.conn = await cached.promise;
	return cached.conn;
}
