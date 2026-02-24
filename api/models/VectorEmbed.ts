import { InferSchemaType, Schema, model } from "mongoose";

const vectorSchema = new Schema({
	id: {
		type: String
	},
	embedding: [Number]
});

type VectorEmbed = InferSchemaType<typeof vectorSchema>;
export default model<VectorEmbed>("VectorEmbed", vectorSchema, "VectorEmbeds");
