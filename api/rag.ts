import JSON_DATASET from "./JSON/Fall_25_Spr26_Q&A_For_Model_Training.json";
import {
	createEmbedder,
	initEmbedder,
	embed,
	SearchItem,
	search
} from "ai-embed-search";
import axios from "axios";
import fs from "fs";

export class RAG {
	private rawEmbedArray: SearchItem[] = [];

	constructor() {
		for (let i = 0; i < JSON_DATASET.length; i++) {
			this.rawEmbedArray.push({
				id: `p${i}`,
				text: `Question: ${JSON_DATASET[i].Question} Answer: ${JSON_DATASET[i].Answer}`
			});
		}
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
					const res = await axios.post("http://localhost:8000/embed", {
						id: rawEmbed.id,
						text: rawEmbed.text
					});
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
}
