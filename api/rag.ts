import axios from "axios";

import cosineSimilarity from "compute-cosine-similarity";

import { GoogleGenerativeAI } from "@google/generative-ai";

import { Vector, RawEmbed, SimilarityResult, DataSet } from "./interfaces";

import VectorEmbed from "./models/VectorEmbed";

export class RAG {
	private rawEmbedArray: RawEmbed[] = [];
	private genAI;
	private model;
	private JSON_DATASET: DataSet[];
	private readonly GEMINI_MODEL = "gemini-2.5-flash-lite";

	constructor(dataSet: DataSet[]) {
		this.JSON_DATASET = dataSet;

		for (let i = 0; i < this.JSON_DATASET.length; i++) {
			this.rawEmbedArray.push({
				id: `p${i}`,

				text: `Question: ${this.JSON_DATASET[i].Question}`
			});
		}

		this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

		this.model = this.genAI.getGenerativeModel({
			model: this.GEMINI_MODEL
		});
	}

	async getEmbeddings(rawEmbed: RawEmbed) {
		const res = await axios.post(`${process.env.PYTHON_SERVER_URL}/embed`, {
			id: rawEmbed.id,

			text: rawEmbed.text
		});

		return res;
	}

	private async verifyEmbeddings(userQuery: string) {
		const GOLDEN_DATA = {
			Question: process.env.GOLDEN_QUESTION,

			Answer: process.env.GOLDEN_ANSWER
		}; // this object contains the "golden question" and "golden answer" that are used as a reference to verify the correctness of the existing embeddings in MongoDB. By comparing the embedding of the golden question and answer with the corresponding entry in the dataset, we can ensure that the embeddings are accurate and up-to-date, which is crucial for the similarity search to function correctly.

		try {
			const result = await this.computeSimilarity(GOLDEN_DATA.Question!); // compute the similarity between the golden question and the existing embeddings in MongoDB to verify that the most similar result corresponds to the golden question and answer in the dataset, which helps ensure that the embeddings are correct and relevant to the current dataset entries

			if (typeof result === "string") {
				// No valid results found for the user query, which indicates that the existing embeddings in MongoDB may not be accurate or relevant to the current dataset entries. In this case, we should ignore it because the user may have asked a question that is not represented in the dataset, and it does not necessarily indicate an issue with the embeddings.

				return;
			} else {
				const data =
					this.JSON_DATASET[
						parseInt((result as SimilarityResult[])[0].id.slice(1))
					]; // retrieve the original dataset entry corresponding to the most similar embedding found in MongoDB by using the ID from the similarity result (removing the 'p' prefix to get the original index)

				if (
					data.Question !== GOLDEN_DATA.Question &&
					data.Answer !== GOLDEN_DATA.Answer
				) {
					// if the retrieved question and answer do not match the golden question and answer, it indicates that the existing embeddings in MongoDB may be outdated or incorrect, which could lead to inaccurate similarity search results. In this case, we need to clear the existing embeddings and regenerate them to ensure that they correspond correctly to the current dataset entries.

					await VectorEmbed.deleteMany({});

					await this.createEmbeddings(userQuery);

					console.log(
						"Existing embeddings were outdated or incorrect. Embeddings have been cleared and regenerated."
					);

					return;
				}

				console.log(
					"Existing embeddings are correct and correspond to the current dataset. No need to regenerate embeddings."
				);

				return;
			}
		} catch (error) {
			if (error) {
				console.error("Error in verifyEmbeddings:", error);

				throw new Error("Failed to verify embeddings");
			}
		}
	}

	async createEmbeddings(userQuery: string) {
		const embeddings: Vector[] = [];

		try {
			// check whether the embed collection exists in Mongo and that there are embeds stored in it

			const existingEmbeds = await VectorEmbed.find({});

			if (existingEmbeds.length > 0) {
				// if embeds exist, use them

				await this.verifyEmbeddings(userQuery); // verify that the existing embeddings are correct and correspond to the current dataset (this is important to ensure that the similarity search will work correctly and that the embeddings are not outdated or mismatched with the dataset entries, which could lead to inaccurate similarity results)

				return existingEmbeds;
			} else {
				for (const rawEmbed of this.rawEmbedArray) {
					// calls Python backend Fast API server to compute embedding logic since it's faster and more efficient than doing it in Node.js with JavaScript

					const res = await this.getEmbeddings(rawEmbed);

					// Create a MongoDB document containing the embedding data for each entry in the dataset. This allows for efficient storage and retrieval of embeddings, and can be particularly beneficial as the dataset grows in size, providing a more scalable solution compared to storing embeddings in a JSON file.

					await VectorEmbed.create({
						id: rawEmbed.id,

						embedding: res.data.embedding
					});
				}

				return embeddings;
			}
		} catch (error) {
			if (error) {
				console.error("Error in createEmbeddings:", error);

				throw new Error("Failed to create and get embeddings");
			}
		}
	}

	async computeSimilarity(userQuery: string, debug: boolean = false) {
		// createEmbeddings MUST BE INVOKED BEFORE THIS METHOD to ensure that the data_with_embeddings.json file is generated and available for reading. This is because computeSimilarity relies on the embeddings stored in that file to calculate the similarity between the user's query and the dataset entries. If createEmbeddings has not been invoked, the necessary embeddings will not exist, and computeSimilarity will not be able to function properly, leading to errors or incorrect results.

		try {
			// get the user's query embedded

			const response = await axios.post(
				`${process.env.PYTHON_SERVER_URL}/query-to-embedding`,
				{
					text: `Question: ${userQuery}` // Add the prefix here so it matches the storage format!
				}
			);

			const queryEmbedding: number[] = response.data.embedding;

			const documents: Vector[] = await VectorEmbed.find({}); // retrieve all documents with embeddings from MongoDB

			const results = documents.map((doc: Vector) => ({
				id: doc.id,
				score: cosineSimilarity(queryEmbedding, doc.embedding) || 0 // default to 0 if cosineSimilarity returns NaN
			}));

			return this.getMostSimilarDocument(results, debug);
		} catch (error) {
			if (error) {
				console.error("Error in computeSimilarity:", error);

				throw new Error("Failed to compute similarity");
			}
		}
	}

	private getMostSimilarDocument(
		results: SimilarityResult[],
		debug: boolean
	): SimilarityResult[] | string {
		// 1. Sort results so the highest score is at index 0
		const mostSimilar = results.sort((a, b) => b.score - a.score);

		if (debug) {
			return mostSimilar.slice(0, 3);
		}

		const THRESHOLD = 0.4;
		const bestMatch = mostSimilar[0]; // This is the winner

		// 2. Check if the winner actually beats the threshold
		if (bestMatch && bestMatch.score >= THRESHOLD) {
			const bestMatchID = parseInt(bestMatch.id.slice(1));
			const answer = this.JSON_DATASET.find(
				(entry, i) => entry.id === bestMatchID.toString()
			)?.Answer;

			if (answer) {
				return answer;
			}
		}

		// 3. Fallback if no match was good enough
		return "I'm sorry, I cannot answer that question based on the provided data.";
	}

	async debug(userQuery: string) {
		// for debugging purposes, return the most similar document's ID, similarity score, and the original question and answer from the dataset to verify that the similarity search is working as expected. This can help identify if the issue lies in the embedding generation, similarity calculation, or if the dataset entries are not being matched correctly with user queries.

		const debugResults = (await this.computeSimilarity(
			userQuery,

			true
		)) as SimilarityResult[];

		if (debugResults && debugResults[0]) {
			// attach readable question/answer to the first result for easier debugging (use `any` to avoid strict type errors)

			// TODO - replace 'any' types here

			(debugResults as unknown as any)[0].readableQuestion =
				this.JSON_DATASET[parseInt(debugResults[0].id.slice(1))]?.Question;

			(debugResults as unknown as any)[0].readableAnswer =
				this.JSON_DATASET[parseInt(debugResults[0].id.slice(1))]?.Answer;
		}

		return debugResults;
	}

	async queryGemini(ragQueryResult: string, userQuery: string) {
		const context = `
 			You are a Q&A chatbot for University of Delaware Graduate Computer Science.
 			Answer ONLY UD CS-related questions using the data below. Use only HTML formatting (<p>, <b>, <i>), and do not use header tags (<h1>-<h6>). Keep your answers concise.
			If the user says hi/hello or asks how you are doing, respond with a friendly greeting and offer assistance with UD CS-related questions.
			User Question: ${userQuery}
			Use ONLY the following data to answer: ${ragQueryResult}
			If the question cannot be answered using the data above, respond exactly with:
			<p>I'm sorry, I cannot answer that question based on the provided data.</p>`;

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

		return { answer: text ?? "Unexpected model response." };
	}
}
