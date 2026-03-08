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

function simpleJSONCheck(JSON_OBJECT: DataSet[]): boolean {
	try {
		JSON.parse(JSON.stringify(JSON_OBJECT));
		return true;
	} catch (error) {
		return false;
	}
}

// Invoke this endpoint to add to your data source by passing in a JSON array of Q&A pairs in the request body. This will allow you to easily expand your dataset with new information, which can then be used to generate embeddings and improve the relevance of responses from the Gemini model when users ask questions related to the newly added data.
const addToDataSource = async (req: Request, res: Response) => {
	await dbConnect();
	const { JSON_DATASET, key } = req.body;

	if (!JSON_DATASET.length) return;

	const validJSON =
		Array.isArray(JSON_DATASET) && simpleJSONCheck(JSON_DATASET);

	if (!validJSON)
		return res
			.status(400)
			.json({ message: "Bad Request: Invalid JSON dataset format" });

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
			let newID = dataSet.length
				? parseInt(dataSet[dataSet.length - 1].id) + 1
				: 0;

			for (const entry of JSON_DATASET) {
				const currentID = newID++;

				const newEntry = new DataSetQAndA({
					id: currentID.toString(),
					Question: entry.Question,
					Answer: entry.Answer,
					Category: entry.Category,
					Notes: entry.Notes
				});

				await newEntry.save();

				const rawEmbed = {
					id: `p${currentID}`,
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
					answer: `<p>${checkGreeting(query) ? "Hello, " + result?.replace(result.split(" ")[0], result?.split(" ")[0].toLowerCase()) : result || "I'm sorry, but I couldn't find any relevant results for your query. We're continuously improving the system, and your feedback would be greatly appreciated; let us know how we can improve or what kinds of questions you'd like answered in the future."}</p>`
				});
			}
		}

		console.error("Gemini error:", err);
		return res.status(500).json({ error: "Gemini request failed" });
	}
};

export { getDataSourceJSON, clearDataSource, addToDataSource, queryGemini };
