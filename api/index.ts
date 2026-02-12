import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
	cors({
		origin: "*"
	})
);

async function fetchDataSourceJSON() {
	try {
		const response = await axios.get(
			"https://bpb-us-w2.wpmucdn.com/sites.udel.edu/dist/4/14087/files/2025/04/QnA_3.json"
		);

		return response.data;
	} catch (error) {
		return { error: "Failed to fetch JSON data" };
	}
}

app.get("/api/data-source-json", async (req, res) => {
	const data = await fetchDataSourceJSON();
	return res.json(data);
});

app.post("/api/ask-gemini", async (req: Request, res: Response) => {
	try {
		const { query } = req.body;
		const jsonData = await fetchDataSourceJSON();

		const context = `
			You are a Q&A chatbot for University of Delaware Graduate Computer Science.
			Answer ONLY UD CS-related questions using the data below.
			Reject unrelated questions concisely. Please ensure your answers utilize HTML, but do not use header tags.

			Data: ${JSON.stringify(jsonData)}
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

		// Changes made:
		// - updated Gemini API key with a new one
		// - updated error handling

		console.error("Gemini error:", err);
		return res.status(500).json({ error: "Gemini request failed" });
	}
});

app.get("/", (req: Request, res: Response) => {
	res.send("Welcome to the CIS Advisor Backend API");
});

app.listen(PORT, () => {
	console.log(`Server is running at http://localhost:${PORT}`);
});
