import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'studio.sqlite3');
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

  CREATE TABLE IF NOT EXISTS scene_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    scene_id INTEGER,
    name TEXT,
    FOREIGN KEY(episode_id) REFERENCES episodes(id),
    FOREIGN KEY(scene_id) REFERENCES scenes(id)
  );
  CREATE INDEX IF NOT EXISTS idx_scene_characters_episode_id ON scene_characters(episode_id);

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    scene_id INTEGER,
    status TEXT,
    output_path TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;