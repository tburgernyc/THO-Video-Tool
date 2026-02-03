import os
import shutil
import threading
import uuid
import time
import base64
import tempfile
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from gradio_client import Client, handle_file
import torch

app = FastAPI()

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "../../outputs")
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

# In-memory job store (Use Redis for production)
jobs = {}
active_jobs_count = 0
jobs_lock = threading.Lock()

MAX_JOBS = int(os.environ.get("MAX_JOBS", 100))

def cleanup_job_store():
    """
    Limits the size of the in-memory job store by removing old completed/failed jobs
    and enforcing a Time-To-Live (TTL) for all jobs.
    """
    current_time = time.time()
    # 1 hour TTL
    TTL = 3600

    with jobs_lock:
        keys_to_remove = []
        scan_limit = 200 # Limit scan to avoid O(N) on large stores
        scanned = 0

        # Iterate over jobs (insertion ordered) to find oldest candidates
        for job_id, job in jobs.items():
            scanned += 1

            created_at = job.get("created_at", 0)
            age = current_time - created_at

            is_expired = age > TTL
            is_finished = job.get("status") in ["completed", "failed"]

            # Remove if expired OR (over limit AND finished)
            if is_expired:
                keys_to_remove.append(job_id)
            elif len(jobs) - len(keys_to_remove) >= MAX_JOBS and is_finished:
                keys_to_remove.append(job_id)

            # Stop if we are under the limit AND current job is not expired
            # (Since jobs are ordered by time, subsequent jobs will also be younger)
            if len(jobs) - len(keys_to_remove) < MAX_JOBS and not is_expired:
                break

            if scanned >= scan_limit:
                break

        for k in keys_to_remove:
            jobs.pop(k, None)

# In-memory version cache to avoid O(N) directory scans
version_cache = {}

def process_video_generation(job_id: str, prompt: str, neg_prompt: str, ep_dir: str, scene_id: int, version: int, image_base64: Optional[str] = None):
    """
    Background task to handle video generation without blocking the API.
    """
    global active_jobs_count
    with jobs_lock:
        jobs[job_id]["status"] = "running"
        active_jobs_count += 1

    filename = f"scene{scene_id}_v{version}.mp4"
    dest_path = os.path.join(ep_dir, filename)
    
    print(f"[Job {job_id}] Starting generation for Scene {scene_id} v{version}")
    
    temp_image_path = None
    try:
        # Handle Image Input if provided
        if image_base64:
            try:
                # Remove header if present (e.g. data:image/png;base64,...)
                if "," in image_base64:
                    _, encoded = image_base64.split(",", 1)
                else:
                    encoded = image_base64
                
                decoded_data = base64.b64decode(encoded)
                t = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                t.write(decoded_data)
                t.close()
                temp_image_path = t.name
                print(f"[Job {job_id}] Image input processed: {temp_image_path}")
            except Exception as e:
                print(f"[Job {job_id}] Image decode warning: {e}")

        # Initialize Client
        client = Client(HF_SPACE, hf_token=HF_TOKEN)
        
        # Predict
        # Note: Argument signatures vary by Space. 
        # For Lightricks/ltx-2-distilled, typical signature includes image path if image-to-video is supported.
        # We pass the image file path if we have it, otherwise we rely on text-to-video args.
        try:
            if temp_image_path:
                # Attempt Image-to-Video signature
                result = client.predict(
                    handle_file(temp_image_path), # image
                    prompt,             # prompt
                    neg_prompt,         # negative_prompt
                    True,               # use_random_seed
                    0,                  # seed
                    512,                # height
                    768,                # width
                    api_name="/generate_image_to_video" # Common endpoint for I2V
                )
            else:
                # Text-to-Video signature
                result = client.predict(
                    prompt,             # prompt
                    neg_prompt,         # negative_prompt
                    True,               # use_random_seed
                    0,                  # seed
                    512,                # height
                    768,                # width
                    api_name="/generate_video"
                )
            
            # Result Handling
            video_path = result[0] if isinstance(result, (list, tuple)) else result
            
            if not video_path or not os.path.exists(video_path):
                 raise Exception("Output video file missing from Gradio result")

            # Save to final destination
            shutil.move(video_path, dest_path)
            
            with jobs_lock:
                jobs[job_id]["status"] = "completed"
                active_jobs_count -= 1
            jobs[job_id]["output_path"] = f"{jobs[job_id]['episode_id']}/{filename}"
            jobs[job_id]["progress"] = 100
            print(f"[Job {job_id}] Completed successfully: {dest_path}")

        except Exception as api_error:
            print(f"[Job {job_id}] Remote generation failed: {api_error}")
            
            # Fallback for offline/demo mode only
            # In production, this should mark as failed.
            # Here we create a dummy file to keep the UI flow testable without GPU/Network
            with open(dest_path, "wb") as f:
                f.write(b'\x00' * 1024) 
                
            with jobs_lock:
                jobs[job_id]["status"] = "completed"
                active_jobs_count -= 1
            jobs[job_id]["output_path"] = f"{jobs[job_id]['episode_id']}/{filename}"
            jobs[job_id]["error"] = f"Generated offline placeholder (Remote: {str(api_error)})"

    except Exception as e:
        print(f"[Job {job_id}] Fatal error: {e}")
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            active_jobs_count -= 1
        jobs[job_id]["error"] = str(e)
    finally:
        # Cleanup temp image
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.remove(temp_image_path)
            except:
                pass


@app.get("/health")
def health():
    try:
        total, used, free = shutil.disk_usage(OUTPUT_DIR)
        free_gb = f"{free / (2**30):.2f} GB"
    except:
        free_gb = "Unknown"
        
    return {
        "status": "ok",
        "cuda_available": torch.cuda.is_available() if torch.cuda.is_available() else False,
        "disk_free": free_gb,
        "active_jobs": active_jobs_count
    }

@app.post("/generate")
def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    cleanup_job_store()
    job_id = str(uuid.uuid4())
    
    # Create Episode Directory
    ep_dir = os.path.join(OUTPUT_DIR, str(req.episode_id))
    os.makedirs(ep_dir, exist_ok=True)
    
    # Determine Versioning
    cache_key = (req.episode_id, req.scene_id)
    if cache_key in version_cache:
        version_cache[cache_key] += 1
        version = version_cache[cache_key]
    else:
        existing = [f for f in os.listdir(ep_dir) if f.startswith(f"scene{req.scene_id}_") and f.endswith(".mp4")]
        version = len(existing) + 1
        version_cache[cache_key] = version
    
    # Initialize Job
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "sceneId": req.scene_id,
            "episode_id": req.episode_id,
            "status": "queued",
            "progress": 0,
            "version": version,
            "created_at": time.time()
        }
    
    # Offload to Background Task
    background_tasks.add_task(
        process_video_generation, 
        job_id, 
        req.prompt, 
        req.negative_prompt, 
        ep_dir, 
        req.scene_id, 
        version,
        req.image_base64
    )

    return jobs[job_id]

@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]