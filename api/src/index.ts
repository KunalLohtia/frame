import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on 0.0.0.0:${PORT}`);
});
