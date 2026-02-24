import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { RAG } from "./rag";
import mongoose from "mongoose";
import DataSetQAndA from "./models/DataSetQAndA";
import { DataSet } from "./interfaces";
import VectorEmbed from "./models/VectorEmbed";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI: string = process.env.MONGO_URI!;

let cached: {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
} = {
	conn: null,
	promise: null
};

async function dbConnect() {
	if (cached.conn) return cached.conn;

	if (!cached.promise) {
		cached.promise = mongoose.connect(MONGO_URI!, {
			serverSelectionTimeoutMS: 30000 // optional
		});
	}

	cached.conn = await cached.promise;
	return cached.conn;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
	cors({
		origin: "*"
	})
);

app.get("/api/data-source-json", async (req, res) => {
	await dbConnect();
	const dataSet: DataSet[] = await DataSetQAndA.find({});
	res.json(dataSet);
});

// Invoke this endpoint to clear your data source by deleting all entries in the MongoDB collection. This can be useful for resetting your dataset during development or when you want to start fresh with a new set of Q&A pairs. Be cautious when using this endpoint, as it will permanently remove all data from the collection.
// To prevent unauthorized access to this endpoint, it requires an admin key to be passed in the query parameters. Make sure to include the correct admin key when making a request to this endpoint, otherwise it will return a 403 Forbidden response.
app.delete("/api/clear-data-source", async (req, res) => {
	await dbConnect();
	const { key } = req.query;

	if (key !== process.env.ADMIN_KEY) {
		return res.status(403).json({ message: "Forbidden: Invalid admin key" });
	} else {
		try {
			await DataSetQAndA.deleteMany({});
			await VectorEmbed.deleteMany({});
			res.json({ message: "Data source cleared successfully" });
		} catch (error) {
			console.error("Error clearing data source:", error);
			res.status(500).json({ message: "Failed to clear data source" });
		}
	}
});

// Invoke this endpoint to add to your data source by passing in a JSON array of Q&A pairs in the request body. This will allow you to easily expand your dataset with new information, which can then be used to generate embeddings and improve the relevance of responses from the Gemini model when users ask questions related to the newly added data.
app.post("/api/add-data-source", async (req, res) => {
	await dbConnect();
	const { JSON_DATASET, key } = req.body;
	const dataSet: DataSet[] = await DataSetQAndA.find({});
	const geminiRag = new RAG(dataSet);

	if (key !== process.env.ADMIN_KEY) {
		return res.status(403).json({ message: "Forbidden: Invalid admin key" });
	} else {
		try {
			// ! NOTE: this method HAS NOT been tested and may result in unexpected errors or issues, so use with caution
			for (const entry of JSON_DATASET) {
				const newID = dataSet.length ? dataSet[dataSet.length - 1].id + 1 : 0;
				const newEntry = new DataSetQAndA({
					// auto-increment the id based on the last entry in the dataset to ensure that each entry has a unique id, which is important for maintaining data integrity and allowing for proper referencing of entries when generating embeddings and computing similarity. If the dataset is empty, start with an id of 0
					id: newID,
					Question: entry.Question,
					Answer: entry.Answer,
					Category: entry.Category,
					Notes: entry.Notes
				});
				await newEntry.save();

				// need to vectorize the new data as well
				const rawEmbed = {
					id: `p${newID}`,
					text: `Question: ${entry.Question} Answer: ${entry.Answer}`
				};

				const res = await geminiRag.getEmbeddings(rawEmbed);

				await VectorEmbed.create({
					id: rawEmbed.id,
					embedding: res.data.embedding
				});
			}

			res.status(201).json({
				message: "Data source added successfully"
			});
		} catch (error) {
			console.error("Error adding data source:", error);
			res.status(500).json({ message: "Failed to add data source" });
		}
	}
});

app.post("/api/ask-gemini", async (req: Request, res: Response) => {
	await dbConnect();
	const { query } = req.body;
	const dataSet: DataSet[] = await DataSetQAndA.find({});
	const geminiRag = new RAG(dataSet);

	try {
		await geminiRag.createEmbeddings();
		const result: string | undefined = (await geminiRag.computeSimilarity(
			query
		)) as string | undefined;

		const answer = await geminiRag.queryGemini(
			result || "No results found",
			query
		);

		return res.json(answer);
	} catch (err) {
		if ((err as any)?.status === 429) {
			const retryInfo = (err as any)?.errorDetails?.find((d: any) =>
				d["@type"]?.includes("RetryInfo")
			);

			if ((retryInfo as any)?.retryDelay) {
				const result: string | undefined = (await geminiRag.computeSimilarity(
					query
				)) as string | undefined;

				// If the error is a 429 Too Many Requests, we can provide a fallback response that includes the most relevant answer from the dataset based on the similarity computation. This way, even if the AI provider is rate-limiting requests, users can still receive some useful information related to their query while they wait for the rate limit to reset.
				return res.json({
					answer: `<p>I apologize, but I'm currently unable to process your request due to high demand. However, based on the similarity computation, the most relevant answer from my dataset is: <strong>${result || "No results found."}</strong> If you feel this answer didn't make sense, please try again in an hour or two when the rate limit has reset.</p>`
				});
			}
		}

		console.error("Gemini error:", err);
		return res.status(500).json({ error: "Gemini request failed" });
	}
});

app.get("/", (_, res: Response) => {
	res.send("Welcome to the CIS Advisor Backend API");
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
