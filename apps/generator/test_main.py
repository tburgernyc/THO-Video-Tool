from fastapi.testclient import TestClient
from main import app
import os
import shutil

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "mode" in data

def test_generate_validation_error():
    # Missing required fields
    response = client.post("/generate", json={})
    assert response.status_code == 422

def test_job_not_found():
    response = client.get("/jobs/nonexistent")
    assert response.status_code == 404
