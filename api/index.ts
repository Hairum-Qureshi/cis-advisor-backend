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
	try {
		const { query } = req.body;

		const geminiRag = new RAG();
		geminiRag.createAndGetEmbeddings();
		const result: string | undefined = (await geminiRag.computeSimilarity(
			query
		)) as string | undefined;

		const answer = await geminiRag.queryGemini(
			result || "No results found",
			query
		);

		return res.json({ answer });
	} catch (err) {
		if ((err as any)?.status === 429) {
			const retryInfo = (err as any)?.errorDetails?.find((d: any) =>
				d["@type"]?.includes("RetryInfo")
			);

			if ((retryInfo as any)?.retryDelay) {
				return res.status(429).json({
					error: "Rate limited by AI provider"
				});
			}

			return res.status(429).json({
				error: "AI quota exhausted",
				message: "Daily request limit reached"
			});
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
