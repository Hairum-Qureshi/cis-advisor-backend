import express, { Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import apiRouter from "./routes/api";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", apiRouter);

app.use(
	cors({
		origin: "*"
	})
);

app.get("/", (_, res: Response) => {
	res.send("Welcome to the CIS Advisor Backend API");
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
