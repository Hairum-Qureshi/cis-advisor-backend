import { Request, Response, NextFunction } from "express";

export default function verifyCredentials(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const { key } = req.body;

	if (!key || !key.trim()) {
		return res.status(400).json({ message: "Missing key" });
	}
    
	if (key !== process.env.ADMIN_KEY) {
		return res.status(403).json({ message: "Forbidden: Invalid admin key" });
	}
	next();
}
