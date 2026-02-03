import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Handle DB Path relative to CWD
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'studio.sqlite3');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Init schema
db.exec(`
  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    script TEXT,
    runtime INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    name TEXT,
    description TEXT,
    FOREIGN KEY(episode_id) REFERENCES episodes(id)
  );
  
  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    scene_index INTEGER,
    description TEXT,
    characters TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    latest_version INTEGER DEFAULT 0,
    FOREIGN KEY(episode_id) REFERENCES episodes(id)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    episode_id INTEGER,
    scene_id INTEGER,
    status TEXT,
    progress INTEGER DEFAULT 0,
    output_path TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations
try {
  const tableInfo = db.pragma('table_info(jobs)') as any[];
  const hasEpId = tableInfo.some(c => c.name === 'episode_id');
  if (!hasEpId) {
    db.prepare('ALTER TABLE jobs ADD COLUMN episode_id INTEGER').run();
  }
  const hasProgress = tableInfo.some(c => c.name === 'progress');
  if (!hasProgress) {
    db.prepare('ALTER TABLE jobs ADD COLUMN progress INTEGER DEFAULT 0').run();
  }
} catch (e) {
  console.warn("Migration warning:", e);
}

export default db;
