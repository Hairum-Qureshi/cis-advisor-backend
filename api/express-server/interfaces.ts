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

interface DataSet {
	id: string;
	Question: string;
	Answer: string;
	Category: string;
	Notes: string;
}

export { SimilarityResult, Vector, RawEmbed, DataSet };
