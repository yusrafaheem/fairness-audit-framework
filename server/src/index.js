import "dotenv/config";
import cors from "cors";
import express from "express";
import auditsRouter from "./routes/audits.js";
import gateRouter from "./routes/gate.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "fairaudit-server" });
});

app.use("/api/audits", auditsRouter);
app.use("/api/gate", gateRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`fairaudit-server listening on http://localhost:${PORT}`);
});
