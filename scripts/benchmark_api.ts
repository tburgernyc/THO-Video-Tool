
const API_URL = 'http://localhost:3000/api';
const NUM_JOBS = 10;

async function createEpisode() {
    try {
        const res = await fetch(`${API_URL}/episodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Benchmark Ep', script: 'Test Script' })
        });
        if (!res.ok) throw new Error(`Create episode failed: ${res.statusText}`);
        const data: any = await res.json();
        return data.episode.id;
    } catch (e) {
        console.error("Error creating episode:", e);
        throw e;
    }
}

async function seedJobs(episodeId: number) {
  console.log('Seeding jobs...');
  const jobIds: string[] = [];
  for (let i = 0; i < NUM_JOBS; i++) {
    try {
        const res = await fetch(`${API_URL}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            episodeId,
            sceneId: i + 1,
            prompt: `Test scene ${i}`,
            negativePrompt: 'bad quality'
          })
        });
        if (!res.ok) {
            console.error(`Failed to seed job ${i}: ${res.status} ${res.statusText}`);
            continue;
        }
        const data: any = await res.json();
        jobIds.push(data.id);
    } catch (e) {
        console.error(`Error seeding job ${i}`, e);
    }
  }
  return jobIds;
}

async function measureSequential(jobIds: string[]) {
  const start = performance.now();
  for (const id of jobIds) {
    await fetch(`${API_URL}/jobs/${id}`);
  }
  const end = performance.now();
  console.log(`Sequential fetch for ${jobIds.length} jobs took ${(end - start).toFixed(2)}ms`);
  return end - start;
}

async function measureBatch(jobIds: string[]) {
  const start = performance.now();
  try {
      const res = await fetch(`${API_URL}/jobs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds })
      });
      if (!res.ok) throw new Error(res.statusText);
      await res.json();
      const end = performance.now();
      console.log(`Batch fetch for ${jobIds.length} jobs took ${(end - start).toFixed(2)}ms`);
      return end - start;
  } catch (e: any) {
      console.log('Batch fetch failed (expected if not implemented):', e.message);
      return null;
  }
}

async function run() {
  try {
    const epId = await createEpisode();
    const jobIds = await seedJobs(epId);
    if (jobIds.length === 0) {
        console.error("No jobs created. Is the server running?");
        return;
    }
    console.log(`Created ${jobIds.length} jobs.`);

    await measureSequential(jobIds);
    await measureBatch(jobIds);
  } catch (e) {
      console.error(e);
  }
}

run();
