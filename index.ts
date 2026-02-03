import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import db from './db';
import { analyzeScript, generateScenePrompts } from './geminiService';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const GENERATOR_URL = process.env.GENERATOR_URL || 'http://localhost:8000';
const OUTPUT_DIR = path.resolve((process as any).cwd(), '../../outputs');

// Ensure output directory exists before serving
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use(cors());
// Explicitly cast to any to satisfy TypeScript overloading
app.use(express.json({ limit: '50mb' }) as any);
app.use('/outputs', express.static(OUTPUT_DIR) as any);

// Status Endpoint
app.get('/api/status', async (_req, res) => {
  let dbOk = true;
  let genOk = false;
  let gpu = false;
  let disk = 'Unknown';
  try {
    db.prepare('SELECT 1').get();
  } catch { dbOk = false; }
  
  try {
    const r = await fetch(`${GENERATOR_URL}/health`);
    if (r.ok) {
      const d: any = await r.json();
      genOk = true;
      gpu = d.cuda_available;
      disk = d.disk_free;
    }
  } catch {}
  
  res.json({ dbConnected: dbOk, generatorOnline: genOk, gpu, diskSpace: disk });
});

// Episodes
app.post('/api/episodes', (req, res) => {
  const { title, script } = req.body;
  const info = db.prepare('INSERT INTO episodes (title, script) VALUES (?, ?)').run(title, script);
  res.json({ episode: { id: info.lastInsertRowid, title, script } });
});

app.get('/api/episodes/latest', (_req, res) => {
  const ep: any = db.prepare('SELECT * FROM episodes ORDER BY id DESC LIMIT 1').get();
  if (!ep) return res.status(404).json({ error: 'No episodes' });
  // @ts-ignore
  const chars = db.prepare('SELECT * FROM characters WHERE episode_id = ?').all(ep.id);

  const scenesRaw = db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_index').all(ep.id);
  const sceneChars = db.prepare('SELECT scene_id, name FROM scene_characters WHERE episode_id = ?').all(ep.id);

  const charMap = new Map<number, string[]>();
  // @ts-ignore
  sceneChars.forEach((c: any) => {
    if (!charMap.has(c.scene_id)) charMap.set(c.scene_id, []);
    charMap.get(c.scene_id)?.push(c.name);
  });

  // @ts-ignore
  const scenes = scenesRaw.map((s: any) => ({
    ...s,
    id: s.scene_index, // Frontend expects logical ID (1, 2, 3) not DB row ID
    db_id: s.id,       // Keep track of internal ID if needed
    characters: charMap.get(s.id) || (s.characters ? JSON.parse(s.characters) : [])
  }));
  res.json({ episode: ep, characters: chars, scenes });
});

app.get('/api/episodes/:id', (req, res) => {
  const ep = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).json({error: 'Not found'});
  const chars = db.prepare('SELECT * FROM characters WHERE episode_id = ?').all(req.params.id);

  const scenesRaw = db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_index').all(req.params.id);
  const sceneChars = db.prepare('SELECT scene_id, name FROM scene_characters WHERE episode_id = ?').all(req.params.id);

  const charMap = new Map<number, string[]>();
  // @ts-ignore
  sceneChars.forEach((c: any) => {
    if (!charMap.has(c.scene_id)) charMap.set(c.scene_id, []);
    charMap.get(c.scene_id)?.push(c.name);
  });

  // @ts-ignore
  const scenes = scenesRaw.map((s: any) => ({
    ...s,
    id: s.scene_index,
    db_id: s.id,
    characters: charMap.get(s.id) || (s.characters ? JSON.parse(s.characters) : [])
  }));
  res.json({ episode: ep, characters: chars, scenes });
});

// Analyze
app.post('/api/episodes/:id/analyze', async (req, res) => {
  const ep: any = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).send();
  
  try {
    const data = await analyzeScript(ep.script);
    
    // Transaction
    const insertChar = db.prepare('INSERT INTO characters (episode_id, name, description) VALUES (?, ?, ?)');
    const insertScene = db.prepare('INSERT INTO scenes (episode_id, scene_index, description, characters) VALUES (?, ?, ?, ?)');
    const insertSceneChar = db.prepare('INSERT INTO scene_characters (episode_id, scene_id, name) VALUES (?, ?, ?)');
    
    db.transaction(() => {
      db.prepare('DELETE FROM characters WHERE episode_id = ?').run(ep.id);
      db.prepare('DELETE FROM scene_characters WHERE episode_id = ?').run(ep.id);
      db.prepare('DELETE FROM scenes WHERE episode_id = ?').run(ep.id);
      
      data.characters.forEach((c: any) => insertChar.run(ep.id, c.name, c.description));
      data.scenes.forEach((s: any) => {
        const info = insertScene.run(ep.id, s.id, s.description, JSON.stringify([]));
        s.characters.forEach((name: string) => {
          insertSceneChar.run(ep.id, info.lastInsertRowid, name);
        });
      });
    })();
    
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Prompts
app.post('/api/episodes/:id/prompts', async (req, res) => {
  const scenes = db.prepare('SELECT scene_index as id, description FROM scenes WHERE episode_id = ?').all(req.params.id);
  try {
    const prompts = await generateScenePrompts(scenes);
    const update = db.prepare('UPDATE scenes SET prompt = ?, negative_prompt = ? WHERE episode_id = ? AND scene_index = ?');
    
    db.transaction(() => {
      prompts.forEach((p: any) => {
        update.run(p.prompt, p.negative_prompt, req.params.id, p.id);
      });
    })();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Jobs
app.post('/api/jobs/video', async (req, res) => {
  const { episodeId, sceneId, prompt, negativePrompt, imageBase64 } = req.body;
  
  try {
    // Call Generator
    const genRes = await fetch(`${GENERATOR_URL}/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        episode_id: episodeId,
        scene_id: sceneId,
        prompt,
        negative_prompt: negativePrompt,
        image_base64: imageBase64
      })
    });
    
    const genData: any = await genRes.json();
    if (!genRes.ok) throw new Error(genData.detail || 'Generator failed');
    
    // Store job. Note: We only store basic info, detailed status is fetched from generator
    db.prepare('INSERT INTO jobs (id, scene_id, status) VALUES (?, ?, ?)').run(genData.id, sceneId, 'queued');
    
    res.json(genData);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const r = await fetch(`${GENERATOR_URL}/jobs/${req.params.id}`);
    const data: any = await r.json();
    
    if (data.status === 'completed' && data.output_path) {
        // Parse version from filename roughly (sceneX_vY.mp4)
        const match = data.output_path.match(/_v(\d+)\.mp4$/);
        const ver = match ? parseInt(match[1]) : 1;
        
        // CRITICAL FIX: Update based on episode_id AND scene_index
        db.prepare('UPDATE scenes SET latest_version = ? WHERE episode_id = ? AND scene_index = ?')
          .run(ver, data.episode_id, data.sceneId);
          
        db.prepare('UPDATE jobs SET status = ?, output_path = ? WHERE id = ?').run('completed', data.output_path, req.params.id);
    }
    
    res.json(data);
  } catch (e) {
    res.status(500).send();
  }
});

app.listen(PORT, () => console.log(`API running on ${PORT}`));