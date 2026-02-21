import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import JSON_DATASET from "./JSON/Fall_25_Spr26_Q&A_For_Model_Training.json";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
	cors({
		origin: "*"
	})
);

app.get("/api/data-source-json", async (req, res) => {
	return res.json(JSON_DATASET);
});

app.post("/api/ask-gemini", async (req: Request, res: Response) => {
	try {
		const { query } = req.body;

		const context = `
			You are a Q&A chatbot for University of Delaware Graduate Computer Science.
			Answer ONLY UD CS-related questions using the data below.
			Reject unrelated questions concisely. Please ensure your answers utilize HTML, but do not use header tags.

			Data: ${JSON.stringify(JSON_DATASET)}
			User: ${query}
		`;

		const requestData = {
			contents: [
				{
					role: "user",
					parts: [{ text: context }]
				}
			]
		};

		const result = await model.generateContent(requestData);

		const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

		// genAI.models.count_tokens does not exist on GoogleGenerativeAI; rely on usage_metadata instead
		if ((result as any).usage_metadata)
			console.log(
				`Total tokens used in the full request/response cycle: ${(result as any).usage_metadata.total_token_count}`
			);

		return res.json({ reply: text ?? "Unexpected model response." });
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
