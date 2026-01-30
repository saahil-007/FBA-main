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

## ⚙️ Production Deployment (Railway)

### 1. Backend Deployment
- Create a new service on Railway from your GitHub repo.
- Set the **Root Directory** to `backend`.
- Add the following Environment Variables:
  - `SUPABASE_URL`: Your Supabase Project URL.
  - `SUPABASE_KEY`: Your Supabase Anon/Service Key.
  - `ALLOWED_ORIGINS`: Your frontend URL (e.g., `https://your-app.up.railway.app`).
- Railway will automatically detect the `Procfile` and `requirements.txt`.

### 2. Frontend Deployment
- Create another service on Railway.
- Set the **Root Directory** to `frontend`.
- Add the following Environment Variables:
  - `VITE_SUPABASE_URL`: Your Supabase Project URL.
  - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key.
  - `VITE_API_URL`: Your backend service URL (e.g., `https://your-backend.up.railway.app`).
- Railway will detect the Vite project and build it automatically.

## 🛠️ Local Development

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
