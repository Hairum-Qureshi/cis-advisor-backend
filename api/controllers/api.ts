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

	try {
		await DataSetQAndA.deleteMany({});
		await VectorEmbed.deleteMany({});
		res.json({ message: "Data source cleared successfully" });
	} catch (error) {
		console.error("Error clearing data source:", error);
		res.status(500).json({ message: "Failed to clear data source" });
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

	console.log(await geminiRag.debug(query));

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
				// ! BUG - it writes 'Hello, i'm sorry' instead of 'Hello, I'm sorry'
				return res.json({
					answer: `<p>${checkGreeting(query) ? "Hello, " + result?.replace(result.split(" ")[0], result?.split(" ")[0].toLowerCase()) : result || "I'm sorry, but I couldn't find any relevant results for your query. We're continuously improving the system, and your feedback would be greatly appreciated; let us know how we can improve or what kinds of questions you'd like answered in the future."}</p>`
				});
			}
		}

		console.error("Gemini error:", err);
		return res.status(500).json({ error: "Gemini request failed" });
	}
};

const deleteQAndAPair = async (req: Request, res: Response) => {
	await dbConnect();
	const { id } = req.params;
	const { key } = req.body;
	try {
		// 'id' must be the MongoDB ID (i.e. '_id') of the Q&A pair you want to delete; not to be confused with the 'id' field in the DataSetQAndA schema.
		// To view the IDs, go to the /data-source-json endpoint and look for the '_id' field of each Q&A pair in the returned JSON array.

		if (!id) {
			return res.status(400).json({ message: "Missing id parameter" });
		}

		await DataSetQAndA.findOneAndDelete({ _id: id });
		await VectorEmbed.findOneAndDelete({ id: `p${id}` });
		res.json({ message: `Q&A pair with id ${id} deleted successfully` });
	} catch (error) {
		console.error(`Error deleting Q&A pair with id ${id}:`, error);
	}
};

const regenerateEmbeddings = async (req: Request, res: Response) => {
	// If you feel that the relevance of the Gemini model's responses has decreased after adding new Q&A pairs to your dataset, you can invoke this endpoint to regenerate all embeddings for the entire dataset. This will ensure that the similarity search is using the most up-to-date embeddings based on the current dataset, which can help improve the relevance of responses when users ask questions related to the newly added data. Keep in mind that regenerating embeddings for a large dataset may take some time, so it's best to use this endpoint during off-peak hours or when you don't expect a high volume of user queries.
	
	await dbConnect();

	try {
		const dataSet: DataSet[] = await DataSetQAndA.find({});
		const geminiRag = new RAG(dataSet);

		for (const entry of dataSet) {
			const rawEmbed = {
				id: `p${entry.id}`,
				text: `Question: ${entry.Question} Answer: ${entry.Answer}`
			};

			const res = await geminiRag.getEmbeddings(rawEmbed);

			await VectorEmbed.findOneAndUpdate(
				{ id: rawEmbed.id },
				{ embedding: res.data.embedding },
				{ upsert: true }
			);
		}
		res.json({ message: "Embeddings regenerated successfully" });
	} catch (error) {
		console.error("Error regenerating embeddings:", error);
		res.status(500).json({ message: "Failed to regenerate embeddings" });
	}
};

export {
	getDataSourceJSON,
	clearDataSource,
	addToDataSource,
	queryGemini,
	deleteQAndAPair,
	regenerateEmbeddings
};
