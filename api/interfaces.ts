interface SimilarityResult {
	id: string;
	score: number;
}

interface Vector {
	id: string;
	embedding: number[];
}

interface RawEmbed {
	id: string;
	text: string;
}

export { SimilarityResult, Vector, RawEmbed };
