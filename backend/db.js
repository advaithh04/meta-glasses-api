const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "mai.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    agent_mode INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tool_logs (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_tool_logs_timestamp ON tool_logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_tool_logs_tool ON tool_logs(tool_name);
`);

module.exports = db;
