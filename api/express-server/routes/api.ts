import express from "express";
import {
	addToDataSource,
	clearDataSource,
	deleteQAndAPair,
	getDataSourceJSON,
	queryGemini,
	regenerateEmbeddings
} from "../controllers/api";
import verifyCredentials from "../controllers/middleware/verifyCredentials";
const router = express.Router();

router.get("/data-source-json", getDataSourceJSON);

router.delete("/clear-data-source", verifyCredentials, clearDataSource);

router.post("/add-data-source", verifyCredentials, addToDataSource);

router.delete("/q-and-a/:id", verifyCredentials, deleteQAndAPair);

router.post("/ask-gemini", queryGemini);

router.put("/regenerate-embeddings", verifyCredentials, regenerateEmbeddings);

export default router;
