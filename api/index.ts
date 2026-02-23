import express, { Request, Response } from "express";
import dotenv from "dotenv";
// import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import JSON_DATASET from "./JSON/Fall_25_Spr26_Q&A_For_Model_Training.json";
import { RAG } from "./rag";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
	cors({
		origin: "*"
	})
);

app.get("/api/data-source-json", (req, res) => {
	return res.json(JSON_DATASET);
});

app.post("/api/ask-gemini", async (req: Request, res: Response) => {
	const { query } = req.body;
	const geminiRag = new RAG();

	try {
		await geminiRag.createAndGetEmbeddings();
		const result: string | undefined = (await geminiRag.computeSimilarity(
			query
		)) as string | undefined;

		const answer = await geminiRag.queryGemini(
			result || "No results found",
			query
		);

		console.log(await geminiRag.debug(query));

		return res.json({ answer });
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
					answer: `<p>Rate limited by AI provider. However, based on the similarity computation, the most relevant answer from the dataset is: ${
						result || "No results found"
					} For a more accurate and detailed response, please make sure your query has no typos or please try again in an hour or two when the rate limit has reset.</p>`
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
	console.log(`Server is running at http://localhost:${PORT}`);
});
