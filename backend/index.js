const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

// --- Conversations ---

app.post("/api/conversations", (req, res) => {
  const { provider, model, userMessage, aiResponse, agentMode } = req.body;
  if (!provider || !model || !userMessage || !aiResponse) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const id = randomUUID();
  const timestamp = Date.now();
  db.prepare(
    `INSERT INTO conversations (id, provider, model, user_message, ai_response, agent_mode, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, provider, model, userMessage, aiResponse, agentMode ? 1 : 0, timestamp);
  res.status(201).json({ id, timestamp });
});

app.get("/api/conversations", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const provider = req.query.provider;

  const where = provider ? "WHERE provider = ?" : "";
  const params = provider ? [provider, limit, offset] : [limit, offset];

  const rows = db
    .prepare(
      `SELECT * FROM conversations ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(...params);
  const total = db
    .prepare(`SELECT COUNT(*) as count FROM conversations ${where}`)
    .get(...(provider ? [provider] : []));

  res.json({ conversations: rows, total: total.count, limit, offset });
});

app.delete("/api/conversations", (req, res) => {
  db.prepare("DELETE FROM conversations").run();
  res.json({ message: "All conversations deleted" });
});

// --- Tool Logs ---

app.post("/api/tool-logs", (req, res) => {
  const { toolName, input, output } = req.body;
  if (!toolName || !input || !output) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const id = randomUUID();
  const timestamp = Date.now();
  db.prepare(
    `INSERT INTO tool_logs (id, tool_name, input, output, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, toolName, String(input), String(output), timestamp);
  res.status(201).json({ id, timestamp });
});

app.get("/api/tool-logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const toolName = req.query.tool;

  const where = toolName ? "WHERE tool_name = ?" : "";
  const params = toolName ? [toolName, limit, offset] : [limit, offset];

  const rows = db
    .prepare(
      `SELECT * FROM tool_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(...params);
  const total = db
    .prepare(`SELECT COUNT(*) as count FROM tool_logs ${where}`)
    .get(...(toolName ? [toolName] : []));

  res.json({ logs: rows, total: total.count, limit, offset });
});

// --- Analytics ---

app.get("/api/analytics", (req, res) => {
  const totalConversations = db
    .prepare("SELECT COUNT(*) as count FROM conversations")
    .get().count;

  const agentConversations = db
    .prepare("SELECT COUNT(*) as count FROM conversations WHERE agent_mode = 1")
    .get().count;

  const byProvider = db
    .prepare(
      "SELECT provider, COUNT(*) as count FROM conversations GROUP BY provider ORDER BY count DESC"
    )
    .all();

  const byModel = db
    .prepare(
      "SELECT model, COUNT(*) as count FROM conversations GROUP BY model ORDER BY count DESC"
    )
    .all();

  const toolUsage = db
    .prepare(
      "SELECT tool_name, COUNT(*) as count FROM tool_logs GROUP BY tool_name ORDER BY count DESC"
    )
    .all();

  const recentActivity = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', timestamp/1000, 'unixepoch') as date,
        COUNT(*) as conversations
       FROM conversations
       WHERE timestamp > ?
       GROUP BY date
       ORDER BY date DESC`
    )
    .all(Date.now() - 7 * 24 * 60 * 60 * 1000);

  res.json({
    totalConversations,
    agentConversations,
    byProvider,
    byModel,
    toolUsage,
    recentActivity,
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Mai backend API running at http://localhost:${PORT}`);
});
