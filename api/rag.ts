import JSON_DATASET from "./JSON/Fall_25_Spr26_Q&A_For_Model_Training.json";
import axios from "axios";
import fs from "fs";
import cosineSimilarity from "compute-cosine-similarity";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Embedding, RawEmbed, SimilarityResult } from "./interfaces";

export class RAG {
	private rawEmbedArray: RawEmbed[] = [];
	private genAI;
	private model;

	constructor() {
		for (let i = 0; i < JSON_DATASET.length; i++) {
			this.rawEmbedArray.push({
				id: `p${i}`,
				text: `Question: ${JSON_DATASET[i].Question} Answer: ${JSON_DATASET[i].Answer}`
			});
		}
		this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
		this.model = this.genAI.getGenerativeModel({
			model: "gemini-2.5-flash-lite"
		});
	}

	async createAndGetEmbeddings() {
		// If you update the original JSON dataaset, delete the data_with_embeddings.json file to regenerate the embeddings with the new dataset. This is a simple caching mechanism to avoid redundant API calls to the embedding service, which can be time-consuming and costly. By checking for the existence of the embeddings file, we can ensure that we only generate embeddings when necessary, improving efficiency and reducing costs.

		let embeddings: { id: string; embeddings: number }[] = [];
		try {
			const parsedJSON = JSON.parse(
				fs.readFileSync("./JSON/data_with_embeddings.json", "utf8")
			);

			return parsedJSON.embeddings;
		} catch (error) {
			if ((error as any).code === "ENOENT") {
				// file doesn't exist
				for (const rawEmbed of this.rawEmbedArray) {
					// calls Python backend Fastify server to compute embedding logic since it's faster and more efficient than doing it in Node.js with JavaScript
					const res = await axios.post(
						`${process.env.PYTHON_SERVER_URL}/embed`,
						{
							id: rawEmbed.id,
							text: rawEmbed.text
						}
					);
					embeddings.push({ id: rawEmbed.id, embeddings: res.data.embedding });
				}

				// create the JSON file with the embeddings for future use (caching)
				fs.writeFileSync(
					"./JSON/data_with_embeddings.json",
					JSON.stringify({ embeddings }, null, 2)
				);

				return embeddings;
			}
		}
	}

	async computeSimilarity(userQuery: string, debug: boolean = false) {
		// createAndGetEmbeddings MUST BE INVOKED BEFORE THIS METHOD to ensure that the data_with_embeddings.json file is generated and available for reading. This is because computeSimilarity relies on the embeddings stored in that file to calculate the similarity between the user's query and the dataset entries. If createAndGetEmbeddings has not been invoked, the necessary embeddings will not exist, and computeSimilarity will not be able to function properly, leading to errors or incorrect results.

		try {
			// get the user's query embedded
			const response = await axios.post(
				`${process.env.PYTHON_SERVER_URL}/query-to-embedding`,
				{
					text: userQuery
				}
			);

			const queryEmbedding: number[] = response.data.embedding;
			const documents: Embedding[] = JSON.parse(
				fs.readFileSync("./JSON/data_with_embeddings.json", "utf8")
			).embeddings;

			const results = documents.map((doc: Embedding) => ({
				id: doc.id,
				score: cosineSimilarity(queryEmbedding, doc.embeddings) || 0 // default to 0 if cosineSimilarity returns NaN
			}));

			return this.getMostSimilarDocument(results, debug);
		} catch (error) {
			if ((error as any).code === "ENOENT") {
				console.error(
					"Embeddings file not found. Please run createAndGetEmbeddings() first to generate the embeddings."
				);
				throw new Error(
					"Embeddings file not found. Please run createAndGetEmbeddings() first to generate the embeddings."
				);
			} else {
				console.log(error);
			}
		}
	}

	private getMostSimilarDocument(
		results: SimilarityResult[],
		debug: boolean
	): SimilarityResult[] | string {
		const mostSimilar: SimilarityResult[] = results
			.sort((a: SimilarityResult, b: SimilarityResult) => b.score - a.score)
			.slice(0, 1) as SimilarityResult[]; // return top 1 most similar entry

		if (debug) {
			return mostSimilar;
		} else {
			const THRESHOLD = 0.6; // set a similarity threshold (this value can be adjusted based on testing and experimentation)
			return mostSimilar[0].score < THRESHOLD
				? "No valid results found for this query"
				: JSON_DATASET[parseInt(mostSimilar[0].id.slice(1))].Answer; // remove the 'p' prefix to get the original index for accessing the JSON_DATASET
		}
	}

	async debug(userQuery: string) {
		// for debugging purposes, return the most similar document's ID, similarity score, and the original question and answer from the dataset to verify that the similarity search is working as expected. This can help identify if the issue lies in the embedding generation, similarity calculation, or if the dataset entries are not being matched correctly with user queries.
		const debugResults = (await this.computeSimilarity(
			userQuery,
			true
		)) as SimilarityResult[];
		if (debugResults && debugResults[0]) {
			// attach readable question/answer to the first result for easier debugging (use `any` to avoid strict type errors)
			(debugResults as unknown as any)[0].readableQuestion =
				JSON_DATASET[parseInt(debugResults[0].id.slice(1))].Question;
			(debugResults as unknown as any)[0].readableAnswer =
				JSON_DATASET[parseInt(debugResults[0].id.slice(1))].Answer;
		}

		return debugResults;
	}

	async queryGemini(ragQueryResult: string, userQuery: string) {
		const context = `
			You are a Q&A chatbot for University of Delaware Graduate Computer Science.
            Answer ONLY UD CS-related questions using the data below.
            Use only HTML formatting (<p>, <b>, <i>), and do not use header tags (<h1>-<h6>).
            Keep your answers concise.

            User Question: ${userQuery}

            Use ONLY the following data to answer:
            ${ragQueryResult}

            If the question cannot be answered using the data above, respond exactly with:
            <p>I'm sorry, I cannot answer that question based on the provided data.</p>
		`;

		const requestData = {
			contents: [
				{
					role: "user",
					parts: [{ text: context }]
				}
			]
		};

		const result = await this.model.generateContent(requestData);

		const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

		if ((result as any).usage_metadata)
			console.log(
				`Total tokens used in the full request/response cycle: ${(result as any).usage_metadata.total_token_count}`
			);

		return { reply: text ?? "Unexpected model response." };
	}
}
