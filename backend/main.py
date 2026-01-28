import os
import json
import logging
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import List, Dict, Optional

import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download

# Import custom services
from services.face_detector import FaceDetector
from services.face_recognizer import FaceRecognizer
from services.embeddings_updation import EmbeddingManager

# Production Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("backend.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("FBA-Backend")

load_dotenv()

# Global Service Instances
detector = None
recognizer = None
embedding_manager = None

# HF Repo for models
HF_REPO = "public-data/insightface"
DET_MODEL_FILE = "models/buffalo_l/det_10g.onnx"
REC_MODEL_FILE = "models/buffalo_l/w600k_r50.onnx"

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, recognizer, embedding_manager
    logger.info("Starting FBA Backend with Modular Services...")
    
    try:
        logger.info(f"Downloading models from HF: {HF_REPO}...")
        det_path = hf_hub_download(repo_id=HF_REPO, filename=DET_MODEL_FILE)
        rec_path = hf_hub_download(repo_id=HF_REPO, filename=REC_MODEL_FILE)
        
        # Initialize services
        detector = FaceDetector(det_path)
        recognizer = FaceRecognizer(rec_path)
        embedding_manager = EmbeddingManager(supabase)
        
        logger.info("All services initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        
    yield
    # Shutdown logic
    logger.info("Shutting down FBA Backend...")
    if embedding_manager:
        embedding_manager.clear_cache()

app = FastAPI(title="FBA Backend", lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase setup
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL or SUPABASE_KEY/SUPABASE_ANON_KEY not found in environment variables.")
    raise RuntimeError("Missing Supabase configuration")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "models_loaded": detector is not None and recognizer is not None,
        "cache_sessions": list(embedding_manager.cache.keys()) if embedding_manager else []
    }

class SessionCreate(BaseModel):
    branch: str
    year: str
    division: str
    subject: Optional[str] = "General"
    teacher_id: Optional[str] = None

@app.post("/create-session")
async def create_session(request: SessionCreate):
    """
    1. Create a new session in Supabase.
    2. Instantly load face descriptors for this session's class.
    """
    if not embedding_manager:
        raise HTTPException(status_code=503, detail="Embedding manager not initialized")

    try:
        # 1. Insert session into Supabase
        session_data = {
            "branch": request.branch,
            "year": request.year,
            "division": request.division,
            "subject": request.subject,
            "teacher_id": request.teacher_id,
            "status": "active"
        }
        resp = supabase.table("sessions").insert(session_data).execute()
        
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to create session in database")
        
        session_id = resp.data[0]["id"]
        logger.info(f"Created new session: {session_id} for {request.branch} {request.year} {request.division}")

        # 2. Instantly load descriptors into local cache
        embeddings = await embedding_manager.load_session_embeddings(session_id)
        
        return {
            "status": "success",
            "session_id": session_id,
            "descriptors_loaded": len(embeddings) if embeddings else 0
        }
    except Exception as e:
        logger.exception("Error in create_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load-session-embeddings/{session_id}")
async def load_session_embeddings(session_id: str):
    if not embedding_manager:
        raise HTTPException(status_code=503, detail="Embedding manager not initialized")
    
    embeddings = await embedding_manager.load_session_embeddings(session_id)
    if embeddings is None:
        raise HTTPException(status_code=404, detail="Session not found or error loading embeddings")
    
    return {"status": "success", "count": len(embeddings)}

@app.post("/recognize/{session_id}")
async def recognize(session_id: str, file: UploadFile = File(...)):
    if not recognizer or not detector or not embedding_manager:
        raise HTTPException(status_code=503, detail="Services not initialized")

    # Load cache if missing
    known_embeddings = embedding_manager.get_session_embeddings(session_id)
    if known_embeddings is None:
        known_embeddings = await embedding_manager.load_session_embeddings(session_id)
        if known_embeddings is None:
            raise HTTPException(status_code=404, detail="Session embeddings not loaded")

    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # 1. Detection
        bbox, kps = detector.detect(img)
        
        if bbox is None:
            # Fallback: if no face detected by SCRFD, we'll try a generous center crop 
            # for portraits as a last resort, but return a message.
            h, w = img.shape[:2]
            s = min(h, w) * 0.8
            bbox = [float((w-s)/2), float((h-s)/2), float((w+s)/2), float((h+s)/2)]
            kps = None
            logger.warning("No face detected by SCRFD, using fallback center crop.")

        # 2. Recognition
        input_embedding = recognizer.get_embedding(img, bbox, kps)
        if not input_embedding:
            return {"status": "success", "matches": [], "bbox": bbox, "message": "Face too small or unclear"}
        
        matches = []
        # Stricter threshold for ArcFace with TTA (Test Time Augmentation)
        # Cosine similarity range is -1 to 1, with TTA, matches are typically > 0.45
        THRESHOLD = 0.45 

        for student_id, data in known_embeddings.items():
            similarity = recognizer.compute_similarity(input_embedding, data["embedding"])
            # Log similarity for top candidates
            if similarity > 0.3:
                logger.info(f"Similarity with {data['name']} ({data['roll_no']}): {similarity:.4f}")
            
            if similarity > THRESHOLD:
                matches.append({
                    "id": student_id, 
                    "name": data["name"], 
                    "roll_no": data["roll_no"],
                    "similarity": float(similarity)
                })

        matches.sort(key=lambda x: x["similarity"], reverse=True)

        if matches:
            best_match = matches[0]
            # Check for duplicate attendance
            existing = supabase.table("attendance_records")\
                .select("*")\
                .eq("session_id", session_id)\
                .eq("student_id", best_match["id"])\
                .execute()
            
            if not existing.data:
                supabase.table("attendance_records").insert({
                    "session_id": session_id, 
                    "student_id": best_match["id"]
                }).execute()
                best_match["status"] = "marked_now"
                logger.info(f"Marked attendance for {best_match['name']} ({best_match['roll_no']})")
            else:
                best_match["status"] = "already_marked"
                logger.info(f"Attendance already marked for {best_match['name']} ({best_match['roll_no']})")

        return {
            "status": "success", 
            "matches": matches, 
            "bbox": bbox
        }
    except Exception as e:
        logger.exception(f"Error recognition in session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/clear-session-cache/{session_id}")
async def clear_session_cache(session_id: str):
    if embedding_manager:
        embedding_manager.clear_cache(session_id)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
