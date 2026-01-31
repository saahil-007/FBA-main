# Face-Based Attendance (FBA) System

A robust, high-performance face detection and recognition system built with FastAPI, React, and Supabase.

## 🚀 Key Features

- **FastAPI Backend**: Asynchronous API for session management and real-time recognition.
- **React Frontend**: Modern UI built with Vite, Tailwind CSS, and Shadcn UI.
- **Optimized Face Detection**: Uses SCRFD detection logic.
- **High-Accuracy Recognition**: Uses ArcFace with keypoint-based alignment.
- **Supabase Integration**: Auth, Database, and Storage integration.
- **Production Ready**: Configured for deployment on platforms like Railway.

## 📁 Project Structure

```text
FBA/
├── backend/
│   ├── services/
│   │   ├── face_detector.py      # SCRFD detection logic
│   │   ├── face_recognizer.py    # ArcFace recognition & alignment
│   │   └── embeddings_updation.py # Session embedding management
│   ├── main.py                   # FastAPI application & routes
│   ├── requirements.txt          # Python dependencies
│   └── Procfile                  # Railway deployment config
├── frontend/
│   ├── src/                      # React source code
│   ├── package.json              # Frontend dependencies
│   └── vite.config.ts            # Vite configuration
└── README.md
```

## ⚙️ Production Deployment (Recommended)

### 1. Backend Deployment (Railway)
- **Service Type**: Docker or Python.
- **Root Directory**: `backend`.
- **Environment Variables**:
  - `SUPABASE_URL`: Your Supabase Project URL.
  - `SUPABASE_KEY`: Your Supabase Anon/Service Key.
  - `HF_REPO`: `public-data/insightface` (Standard High-Accuracy Model).
  - `DET_MODEL_FILE`: `models/buffalo_l/det_10g.onnx`.
  - `REC_MODEL_FILE`: `models/buffalo_l/w600k_r50.onnx`.
  - `ALLOWED_ORIGINS`: Your frontend URL (e.g., `https://fba-frontend.vercel.app`).
- **Optimization**: Railway is recommended for the backend as these larger models require more memory (approx 1GB+ RAM) during initialization. Ensure your Railway plan has sufficient memory.

### 2. Frontend Deployment (Vercel)
- **Framework Preset**: Vite.
- **Root Directory**: `frontend`.
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Your Supabase Project URL.
  - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key.
  - `VITE_API_URL`: Your backend service URL (e.g., `https://fba-backend.up.railway.app`). **MUST start with https://**.
- **Optimization**: Vercel is the best choice for hosting Vite-based static sites. The included `vercel.json` ensures that all routes are correctly handled by the React app.

### 🔍 Troubleshooting & Monitoring

- **Backend Health Check**: Visit `https://your-backend.up.railway.app/health` to see the initialization status of the face recognition models.
- **Initialization Error**: If the health check shows `init_status: "error"`, check the `init_error` message. Common issues include incorrect HuggingFace repository or file paths.
- **Retry Initialization**: If the backend failed to load models (e.g., due to a temporary network issue), you can trigger a retry by sending a POST request to `/retry-init`.

---

## 🛠️ Local Development

### Backend
```bash
cd backend
python -m venv venv
venv/Scripts/activate
pip install -r requirements.txt
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
