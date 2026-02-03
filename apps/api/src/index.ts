import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import db from './db';
import { analyzeScript, generateScenePrompts } from './geminiService';

const app = express();
const PORT = process.env.PORT || 3000;
const GENERATOR_URL = process.env.GENERATOR_URL || 'http://localhost:8000';
// Output dir relative to wherever we run. If running from root with npm run dev -w apps/api, cwd is root/apps/api (usually) or root?
// "npm run dev -w apps/api" -> runs the script IN apps/api. So cwd is apps/api.
// So OUTPUT_DIR should be ../../outputs.
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(process.cwd(), '../../outputs');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/outputs', express.static(OUTPUT_DIR));

// --- Schemas ---
const CreateEpisodeSchema = z.object({
  title: z.string().min(1),
  script: z.string().min(1)
});

const JobRequestSchema = z.object({
  episodeId: z.number(),
  sceneId: z.number(),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  imageBase64: z.string().optional()
});

// --- Middleware for Zod ---
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (e: any) {
    res.status(400).json({ error: e.errors });
  }
};

// --- Routes ---

app.get('/api/status', async (req, res) => {
  let dbOk = true;
  let genOk = false;
  let gpu = false;
  let disk = 'Unknown';

  try { db.prepare('SELECT 1').get(); } catch { dbOk = false; }

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

app.post('/api/episodes', validate(CreateEpisodeSchema), (req, res) => {
  const { title, script } = req.body;
  const info = db.prepare('INSERT INTO episodes (title, script) VALUES (?, ?)').run(title, script);
  res.json({ episode: { id: info.lastInsertRowid, title, script } });
});

app.get('/api/episodes/latest', (req, res) => {
  const ep = db.prepare('SELECT * FROM episodes ORDER BY id DESC LIMIT 1').get();
  if (!ep) return res.status(404).json({ error: 'No episodes' });
  const chars = db.prepare('SELECT * FROM characters WHERE episode_id = ?').all((ep as any).id);
  const scenes = db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_index').all((ep as any).id).map((s: any) => ({
    ...s,
    id: s.scene_index,
    db_id: s.id,
    characters: s.characters ? JSON.parse(s.characters) : []
  }));
  res.json({ episode: ep, characters: chars, scenes });
});

app.get('/api/episodes/:id', (req, res) => {
  const ep = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).json({error: 'Not found'});
  const chars = db.prepare('SELECT * FROM characters WHERE episode_id = ?').all(req.params.id);
  const scenes = db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_index').all(req.params.id).map((s: any) => ({
    ...s,
    id: s.scene_index,
    db_id: s.id,
    characters: s.characters ? JSON.parse(s.characters) : []
  }));
  res.json({ episode: ep, characters: chars, scenes });
});

app.get('/api/episodes/:id/export/metadata', (req, res) => {
    const ep = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!ep) return res.status(404).json({error: 'Not found'});

    const scenes = db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_index').all(req.params.id);

    const metadata = {
        id: (ep as any).id,
        title: (ep as any).title,
        scenes: scenes.map((s: any) => ({
            id: s.scene_index,
            description: s.description,
            video: `scene${s.scene_index}_v${s.latest_version}.mp4`
        }))
    };

    // Also save to output dir
    const epDir = path.join(OUTPUT_DIR, req.params.id);
    if (fs.existsSync(epDir)) {
        fs.writeFileSync(path.join(epDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }

    res.json(metadata);
});

app.post('/api/episodes/:id/analyze', async (req, res) => {
  const ep: any = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  if (!ep) return res.status(404).send();

  try {
    const data = await analyzeScript(ep.script);

    const insertChar = db.prepare('INSERT INTO characters (episode_id, name, description) VALUES (?, ?, ?)');
    const insertScene = db.prepare('INSERT INTO scenes (episode_id, scene_index, description, characters) VALUES (?, ?, ?, ?)');

    db.transaction(() => {
      db.prepare('DELETE FROM characters WHERE episode_id = ?').run(ep.id);
      db.prepare('DELETE FROM scenes WHERE episode_id = ?').run(ep.id);

      data.characters.forEach((c: any) => insertChar.run(ep.id, c.name, c.description));
      data.scenes.forEach((s: any) => insertScene.run(ep.id, s.id, s.description, JSON.stringify(s.characters)));
    })();

    res.json({ success: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

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

app.post('/api/jobs', validate(JobRequestSchema), async (req, res) => {
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

    // Store job
    // Generator returns { id, ... }
    db.prepare('INSERT INTO jobs (id, episode_id, scene_id, status) VALUES (?, ?, ?, ?)')
      .run(genData.id, episodeId, sceneId, 'queued');

    res.json(genData);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({error: 'Job not found'});
    res.json(job);
});

app.post('/api/jobs/:id/cancel', async (req, res) => {
    const job: any = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({error: 'Job not found'});

    try {
        await fetch(`${GENERATOR_URL}/jobs/${req.params.id}/cancel`, { method: 'POST' });
        db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('cancelled', req.params.id);
        res.json({success: true});
    } catch (e: any) {
        res.status(500).json({error: e.message});
    }
});


// --- Background Poller ---
if (process.env.NODE_ENV !== 'test') {
    setInterval(async () => {
        try {
            const activeJobs: any[] = db.prepare("SELECT * FROM jobs WHERE status IN ('queued', 'running')").all();

            for (const job of activeJobs) {
                try {
                    const res = await fetch(`${GENERATOR_URL}/jobs/${job.id}`);
                    if (!res.ok) {
                        if (res.status === 404) {
                            db.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?').run('failed', 'Job lost in generator', job.id);
                        }
                        continue;
                    }
                    const data: any = await res.json();

                    // Update Status
                    db.prepare('UPDATE jobs SET status = ?, progress = ?, output_path = ?, error = ? WHERE id = ?')
                      .run(data.status, data.progress || 0, data.output_path, data.error, job.id);

                    if (data.status === 'completed' && data.output_path) {
                        // Update Scene latest_version
                        // Extract version from filename or data if available.
                        // Generator response usually has 'version' in jobs dict?
                        // Let's rely on data.version if available, or parse filename
                        let ver = 1;
                        if (data.version) {
                            ver = data.version;
                        } else if (data.output_path) {
                             const match = data.output_path.match(/_v(\d+)\.mp4$/);
                             if (match) ver = parseInt(match[1]);
                        }

                        db.prepare('UPDATE scenes SET latest_version = ? WHERE episode_id = ? AND scene_index = ?')
                          .run(ver, job.episode_id, job.scene_id);
                    }
                } catch (e) {
                    console.warn(`Poller error for job ${job.id}:`, e);
                }
            }
        } catch (e) {
            console.error("Poller Loop Error:", e);
        }
    }, 3000);
}

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`API running on ${PORT}`));
}

export default app;
