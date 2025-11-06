import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

dotenv.config();

const app = express();
const POST = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.use(express.json());

app.get("/data-source-json", async (req, res) => {
	try {
		const response = await axios.get(
			"https://bpb-us-w2.wpmucdn.com/sites.udel.edu/dist/4/14087/files/2025/04/QnA_3.json"
		);

		res.json(response.data);
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch JSON data" });
	}
});

app.post("/ask-gemini", async (req: Request, res: Response) => {
	try {
		const { query, jsonData } = req.body;

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

		return res.json({ reply: text ?? "Unexpected model response." });
	} catch (err) {
		console.error(err);
		return res
			.status(500)
			.json({ error: "Failed to get response from Gemini AI" });
	}
});

app.listen(POST, () => {
	console.log(`Server is running at http://localhost:${POST}`);
});
