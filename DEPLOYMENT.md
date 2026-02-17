# Face Based Attendance System - Deployment Guide

This guide details how to deploy the **Backend on Render** and the **Frontend on Vercel**.

## Prerequisites

1.  **GitHub Account**: The code must be pushed to a GitHub repository.
2.  **Supabase Project**: You need a Supabase project with the database schema applied.
3.  **Render Account**: For deploying the Python backend.
4.  **Vercel Account**: For deploying the React frontend.

---

## Part 1: Database Setup (Supabase)

1.  Go to your Supabase project dashboard.
2.  Navigate to the **SQL Editor**.
3.  Open `supabase_schema.sql` from this repository.
4.  Copy the content and run it in the SQL Editor to create the necessary tables.
5.  Go to **Project Settings > API** and copy:
    -   `Project URL` (SUPABASE_URL)
    -   `anon` public key (SUPABASE_KEY)

---

## Part 2: Backend Deployment (Render)

1.  Log in to [Render.com](https://render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  **Configure the service**:
    -   **Name**: `fba-backend` (or similar)
    -   **Region**: Choose the one closest to you (e.g., Singapore, Frankfurt).
    -   **Branch**: `main` (or your working branch).
    -   **Root Directory**: `backend` (Important!)
    -   **Runtime**: `Python 3`
    -   **Build Command**: `pip install -r requirements.txt`
    -   **Start Command**: `gunicorn main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120`
    -   **Instance Type**: Free (or Starter for better performance).

5.  **Environment Variables**:
    Scroll down to "Environment Variables" and add the following:
    
    | Key | Value |
    | --- | --- |
    | `PYTHON_VERSION` | `3.11.0` |
    | `SUPABASE_URL` | *Your Supabase Project URL* |
    | `SUPABASE_KEY` | *Your Supabase Anon Key* |
    | `ALLOWED_ORIGINS` | `https://your-frontend-app.vercel.app,http://localhost:5173` (You will update this after deploying frontend) |
    | `HF_REPO` | `public-data/insightface` |
    | `DET_MODEL_FILE` | `models/buffalo_l/det_10g.onnx` |
    | `REC_MODEL_FILE` | `models/buffalo_l/w600k_r50.onnx` |
    | `RECOGNITION_THRESHOLD` | `0.45` |
    | `DEFAULT_GEOFENCE_RADIUS` | `15` |

6.  Click **Create Web Service**.
7.  Wait for the deployment to finish. It might take a few minutes to download the models.
8.  **Copy the Backend URL** (e.g., `https://fba-backend.onrender.com`).

---

## Part 3: Frontend Deployment (Vercel)

1.  Log in to [Vercel.com](https://vercel.com).
2.  Click **Add New...** -> **Project**.
3.  Import your GitHub repository.
4.  **Configure Project**:
    -   **Framework Preset**: Vite
    -   **Root Directory**: `frontend` (Click Edit and select the `frontend` folder).
    
5.  **Environment Variables**:
    Expand the "Environment Variables" section and add:

    | Key | Value |
    | --- | --- |
    | `VITE_SUPABASE_URL` | *Your Supabase Project URL* |
    | `VITE_SUPABASE_ANON_KEY` | *Your Supabase Anon Key* |
    | `VITE_API_URL` | *Your Render Backend URL* (e.g., `https://fba-backend.onrender.com`) |

6.  Click **Deploy**.
7.  Wait for the build to complete.
8.  **Copy the Frontend URL** (e.g., `https://your-app.vercel.app`).

---

## Part 4: Final Configuration

1.  Go back to **Render Dashboard** > **fba-backend** > **Environment**.
2.  Update `ALLOWED_ORIGINS` to include your new Vercel URL.
    -   Example: `https://your-app.vercel.app,http://localhost:5173`
3.  **Save Changes** (Render will redeploy automatically).

## Troubleshooting

-   **Backend 503 Service Unavailable**: The models are still loading. Check the Render logs. It usually takes 1-2 minutes on the first start.
-   **CORS Errors**: Ensure `ALLOWED_ORIGINS` in Render exactly matches your Vercel URL (no trailing slash).
-   **Face Detection Fails**: Ensure the backend has enough memory. On Render Free Tier, if it crashes, you might need to upgrade to Starter.
-   **Cold Starts**: Render Free Tier spins down after inactivity. The first request might take 50+ seconds. Use a specialized uptime monitor or upgrade to Starter to keep it active.
