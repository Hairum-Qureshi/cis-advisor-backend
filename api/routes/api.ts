import express from "express";
import {
	addToDataSource,
	clearDataSource,
	getDataSourceJSON,
	queryGemini
} from "../controllers/api";
const router = express.Router();

router.get("/data-source-json", getDataSourceJSON);

router.delete("/clear-data-source", clearDataSource);

router.post("/add-data-source", addToDataSource);

router.post("/ask-gemini", queryGemini);

export default router;
