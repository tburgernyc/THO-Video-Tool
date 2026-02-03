# Human Override Studio LTX2

**Human Override Studio LTX2** is a local-first application for turning scripts into AI-generated video episodes using the **LTX-2** video model and **Google Gemini** for reasoning.

## Architecture
- **Frontend**: React + TypeScript (Vite) with Tailwind CSS.
- **Orchestrator**: Node.js (Express) + SQLite. Calls Gemini for script analysis and prompt engineering.
- **Generator**: Python (FastAPI). Wraps LTX-2 (via HuggingFace Gradle Client or local if configured) for video generation.

## Prerequisites
1. Node.js 18+
2. Python 3.10+
3. Google Gemini API Key
4. (Optional) CUDA GPU for local inference, otherwise uses remote HF Space fallback.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `apps/api/.env` and `apps/generator/.env` and fill in your keys.

   ```bash
   cp .env.example apps/api/.env
   cp .env.example apps/generator/.env
   ```

3. **Run**
   ```bash
   npm run dev
   ```
   This starts all three services concurrently:
   - Web: http://localhost:5173
   - API: http://localhost:3000
   - Generator: http://localhost:8000
