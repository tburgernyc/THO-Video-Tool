import os
import shutil
import uuid
import time
import base64
import tempfile
import asyncio
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from gradio_client import Client, handle_file
import torch

app = FastAPI()

# Configuration
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "../../outputs")
GENERATOR_MODE = os.environ.get("GENERATOR_MODE", "remote").lower() # remote, local, mock
HF_SPACE = os.environ.get("VIDEO_GENERATOR_SPACE", "Lightricks/ltx-2-distilled")
HF_TOKEN = os.environ.get("HF_TOKEN")

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

class GenerateRequest(BaseModel):
    episode_id: int
    scene_id: int
    prompt: str
    negative_prompt: Optional[str] = "low quality, worst quality, deformed, distorted, watermark"
    image_base64: Optional[str] = None

# In-memory job store
jobs = {}

# Tiny 1x1 black pixel MP4 for mock mode
MOCK_MP4_B64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAWJbWRhdAAAAAAAAAAwZ2JjdHcAAAAAAAAAAQAAAABnZmNjAAAAZmZmZgEAAAAgZnJjZwAAAAEAAAAAAAEAAQAAAAEAAAAAAAAAAQAAAAAAAAAgbXZoZAAAAABWJ68AVievAAABAAABAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIGdHJhawAAAAx0a2hkAAAAAVYnrwAAAAEAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAHm1kaWEAAAAIbWRoZAAAAABWJ68AAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAHgAAAAAAAAAAMWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAAF2bWluZgAAAAhmaGQAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA5HN0YmwAAACkc3RzZAAAAAAAAAABAAAAhGF2YzEAAAAAAAAAAQABAAAAAAAAAAAAAAAAAAAAAAEAAAEAAAEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAAxYXZjQwH0AAr/4QAZZ/QACq609QAFAAAAAwAEAAAGUeLF8uCDQAAAAAYD6AAAABhzdHRzAAAAAAAAAAEAAAABAAABAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAwc3R6MgAAAAAAAAAAAAABAAAAFHN0Y28AAAAAAAAAAQAAADAAAAAAY3R0cwAAAAAAAAAAAAABAAAABAAAAAA="

def run_mock_generation(job_id: str, dest_path: str):
    time.sleep(2) # Simulate work
    if jobs[job_id]["status"] == "cancelled":
        return

    try:
        data = base64.b64decode(MOCK_MP4_B64)
        with open(dest_path, "wb") as f:
            f.write(data)
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        print(f"[Mock] Job {job_id} completed.")
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

def process_video_generation(job_id: str, prompt: str, neg_prompt: str, ep_dir: str, scene_id: int, version: int, image_base64: Optional[str] = None):
    jobs[job_id]["status"] = "running"
    filename = f"scene{scene_id}_v{version}.mp4"
    dest_path = os.path.join(ep_dir, filename)
    jobs[job_id]["output_path"] = f"{jobs[job_id]['episode_id']}/{filename}"

    print(f"[Job {job_id}] Mode: {GENERATOR_MODE} | Scene {scene_id} v{version}")

    if GENERATOR_MODE == "mock":
        run_mock_generation(job_id, dest_path)
        return

    temp_image_path = None
    try:
        # Handle Image
        if image_base64:
            try:
                if "," in image_base64: _, encoded = image_base64.split(",", 1)
                else: encoded = image_base64
                decoded_data = base64.b64decode(encoded)
                t = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                t.write(decoded_data)
                t.close()
                temp_image_path = t.name
            except Exception as e:
                print(f"[Job {job_id}] Image decode warning: {e}")

        # REMOTE MODE
        if GENERATOR_MODE == "remote":
            client = Client(HF_SPACE, hf_token=HF_TOKEN)

            if jobs[job_id]["status"] == "cancelled": return

            if temp_image_path:
                result = client.predict(
                    handle_file(temp_image_path), prompt, neg_prompt, True, 0, 512, 768,
                    api_name="/generate_image_to_video"
                )
            else:
                result = client.predict(
                    prompt, neg_prompt, True, 0, 512, 768,
                    api_name="/generate_video"
                )

            video_path = result[0] if isinstance(result, (list, tuple)) else result
            if not video_path or not os.path.exists(video_path):
                 raise Exception("Output video file missing")

            if jobs[job_id]["status"] == "cancelled": return

            shutil.move(video_path, dest_path)
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["progress"] = 100

        # LOCAL MODE (Not implemented fully as per requirements, just fallback or fail)
        elif GENERATOR_MODE == "local":
             # Requirement: "Preserve a path to local GPU mode... but it must not be required"
             # Since user can't run local LTX-2, we can fail gracefully or implement if we had the code.
             # I'll implement a graceful failure.
             raise Exception("Local generation not supported in this environment.")

        else:
            raise Exception(f"Unknown mode: {GENERATOR_MODE}")

    except Exception as e:
        print(f"[Job {job_id}] Error: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
    finally:
        if temp_image_path and os.path.exists(temp_image_path):
            try: os.remove(temp_image_path)
            except: pass

@app.get("/health")
def health():
    try:
        total, used, free = shutil.disk_usage(OUTPUT_DIR)
        free_gb = f"{free / (2**30):.2f} GB"
    except:
        free_gb = "Unknown"
    return {
        "status": "ok",
        "mode": GENERATOR_MODE,
        "cuda_available": torch.cuda.is_available() if torch.cuda.is_available() else False,
        "disk_free": free_gb,
        "active_jobs": len([j for j in jobs.values() if j['status'] == 'running'])
    }

@app.post("/generate")
def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    ep_dir = os.path.join(OUTPUT_DIR, str(req.episode_id))
    os.makedirs(ep_dir, exist_ok=True)

    existing = [f for f in os.listdir(ep_dir) if f.startswith(f"scene{req.scene_id}_") and f.endswith(".mp4")]
    version = len(existing) + 1

    jobs[job_id] = {
        "id": job_id,
        "sceneId": req.scene_id,
        "episode_id": req.episode_id,
        "status": "queued",
        "progress": 0,
        "version": version
    }

    background_tasks.add_task(
        process_video_generation,
        job_id, req.prompt, req.negative_prompt, ep_dir, req.scene_id, version, req.image_base64
    )
    return jobs[job_id]

@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    jobs[job_id]["status"] = "cancelled"
    return {"status": "cancelled"}
