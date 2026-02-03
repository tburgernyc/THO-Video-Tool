import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/index';

describe('API Contract', () => {
  it('GET /api/status returns correct schema', async () => {
    const res = await request(app).get('/api/status');
    assert.strictEqual(res.status, 200);
    assert.ok('dbConnected' in res.body);
    assert.ok('generatorOnline' in res.body);
  });

  it('POST /api/episodes validates schema (missing title)', async () => {
    const res = await request(app).post('/api/episodes').send({ script: 'test' });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/episodes creates episode', async () => {
    const res = await request(app).post('/api/episodes').send({ title: 'Test Ep', script: 'INT. DAY' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.episode.id);
  });
});
