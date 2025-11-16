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

		return res.json({ reply: text ?? "Unexpected model response." });
	} catch (err) {
		console.error(err);
		return res
			.status(500)
			.json({ error: "Failed to get response from Gemini AI" });
	}
});

app.get("/", (req: Request, res: Response) => {
	res.send("Welcome to the CIS Advisor Backend API");
});

export default async function handler(req: Request, res: Response) {
	try {
		const body = {
			access_key: process.env.WEB3FORMS_KEY,
			from_name: "Chatbot Weekly Reminder",
			subject: "Weekly Feedback Reminder",
			message:
				"Hello! This is your weekly reminder to check your feedback dashboard:\n\nhttps://sites.udel.edu/your-link-here",
			to_email: "wemef86542@agenra.com"
		};

		const result = await fetch("https://api.web3forms.com/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		});

		const data = await result.json();
		console.log("Web3Forms response:", data);

		return res.status(200).json({ success: true, data });
	} catch (error) {
		console.error("Cron error:", error);
		return res.status(500).json({ error: "Cron failed" });
	}
}

app.listen(PORT, () => {
	console.log(`Server is running at http://localhost:${PORT}`);
});
