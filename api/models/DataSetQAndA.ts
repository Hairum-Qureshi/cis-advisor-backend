import { InferSchemaType, Schema, model } from "mongoose";

const dataSetQandASchema = new Schema({
	id: {
		type: String,
		isUnique: true
	},
	Question: {
		type: String
	},
	Answer: {
		type: String
	},
	Category: {
		type: String
	},
	Notes: {
		type: String
	}
});

type DataSetQandA = InferSchemaType<typeof dataSetQandASchema>;
export default model<DataSetQandA>(
	"JSONSource",
	dataSetQandASchema,
	"JSONSource"
);
