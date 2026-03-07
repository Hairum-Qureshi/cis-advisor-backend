import { Request, Response } from "express";
import dbConnect from "../utils/mongoConnection";
import { DataSet } from "../interfaces";
import DataSetQAndA from "../models/DataSetQAndA";
import VectorEmbed from "../models/VectorEmbed";
import { RAG } from "../rag";
import dotenv from "dotenv";

dotenv.config();

const getDataSourceJSON = async (req: Request, res: Response) => {
	try {
		await dbConnect();
		const dataSet: DataSet[] = await DataSetQAndA.find({});
		res.json(dataSet);
	} catch (error) {
		console.error("Error fetching data source JSON:", error);
		res.status(500).json({ message: "Failed to fetch data source JSON" });
	}
};

// Invoke this endpoint to clear your data source by deleting all entries in the MongoDB collection. This can be useful for resetting your dataset during development or when you want to start fresh with a new set of Q&A pairs. Be cautious when using this endpoint, as it will permanently remove all data from the collection.
const clearDataSource = async (req: Request, res: Response) => {
	await dbConnect();
	const { key } = req.query as { key: string };

	// To prevent unauthorized access to this endpoint, it requires an admin key to be passed in the query parameters. Make sure to include the correct admin key when making a request to this endpoint, otherwise it will return a 403 Forbidden response.
	if (!key || !key.trim())
		return res
			.status(400)
			.json({ message: "Bad Request: Admin key is required" });

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
};

// Invoke this endpoint to add to your data source by passing in a JSON array of Q&A pairs in the request body. This will allow you to easily expand your dataset with new information, which can then be used to generate embeddings and improve the relevance of responses from the Gemini model when users ask questions related to the newly added data.
const addToDataSource = async (req: Request, res: Response) => {
	await dbConnect();
	const { JSON_DATASET, key } = req.body;

	const dataSet: DataSet[] = await DataSetQAndA.find({});
	const geminiRag = new RAG(dataSet);

	if (!key || !key.trim())
		return res
			.status(400)
			.json({ message: "Bad Request: Admin key is required" });

	if (key !== process.env.ADMIN_KEY) {
		return res.status(403).json({ message: "Forbidden: Invalid admin key" });
	} else {
		try {
			if (!JSON_DATASET.length) return;

			for (const entry of JSON_DATASET) {
				let newID: number;
				if (!dataSet.length) newID = -1;
				else {
					const lastEntry = dataSet[dataSet.length - 1];
					newID = parseInt(lastEntry.id) + 1;
					while (dataSet.some(data => parseInt(data.id) === newID)) {
						newID++;
					}
				}

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
};

function checkGreeting(query: string): boolean {
	const greetings = [
		"hi",
		"hello",
		"hey",
		"heya",
		"yo",
		"greetings",
		"good morning",
		"good afternoon",
		"good evening"
	];
	const lowerCaseQuery = query.toLowerCase();
	return greetings.some(greeting => lowerCaseQuery.includes(greeting));
}

const queryGemini = async (req: Request, res: Response) => {
	await dbConnect();
	const { query } = req.body;
	const dataSet: DataSet[] = await DataSetQAndA.find({});
	const geminiRag = new RAG(dataSet);

	try {
		await geminiRag.createEmbeddings(query);
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
					answer: `<p>${checkGreeting(query) ? "Hello, " + result?.replace(result.split(" ")[0], result?.split(" ")[0].toLowerCase()) : result || "I'm sorry, but I couldn't find any relevant results for your query. We're continuously improving the system, and your feedback would be greatly appreciated; let us know how we can improve or what kinds of questions you'd like answered in the future."} If this response doesn't seem accurate or doesn't fully address your question, please try again in a few hours after the rate limit resets, or consider rephrasing your question.</p>`
				});
			}
		}

		console.error("Gemini error:", err);
		return res.status(500).json({ error: "Gemini request failed" });
	}
};

export { getDataSourceJSON, clearDataSource, addToDataSource, queryGemini };
