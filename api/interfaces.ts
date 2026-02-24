interface SimilarityResult {
	id: string;
	score: number;
}

interface Embedding {
	id: string;
	embedding: number[];
}

interface RawEmbed {
	id: string;
	text: string;
}

export { SimilarityResult, Embedding, RawEmbed };
