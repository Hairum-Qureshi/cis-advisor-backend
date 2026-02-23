interface SimilarityResult {
	id: string;
	score: number;
}

interface Embedding {
	id: string;
	embeddings: number[];
}

interface RawEmbed {
	id: string;
	text: string;
}

export { SimilarityResult, Embedding, RawEmbed };
