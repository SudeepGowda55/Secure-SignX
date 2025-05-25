import dotenv from "dotenv";
dotenv.config();

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  const API_KEY = process.env.API_KEY;

  if (token == null) return res.status(401).json({ message: "Token required" });

  if (token !== API_KEY) return res.status(403).json({ message: "Invalid token" });

  next();
};
