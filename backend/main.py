import os
import json
import logging
import io
import pandas as pd
from datetime import datetime
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import List, Dict, Optional
from fpdf import FPDF

import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.responses import StreamingResponse
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

@app.get("/sessions")
async def get_sessions():
    """Fetch all sessions sorted by created_at"""
    try:
        resp = supabase.table("sessions").select("*").order("created_at", desc=True).execute()
        return resp.data
    except Exception as e:
        logger.exception("Error fetching sessions")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/attendance")
async def get_session_attendance(session_id: str):
    """Fetch attendance records for a specific session"""
    try:
        # Get attendance records joined with student info
        resp = supabase.table("attendance_records")\
            .select("*, students(name, roll_no)")\
            .eq("session_id", session_id)\
            .execute()
        
        # Format the data
        attendance = []
        for record in resp.data:
            attendance.append({
                "student_id": record["student_id"],
                "name": record["students"]["name"],
                "roll_no": record["students"]["roll_no"],
                "marked_at": record["created_at"]
            })
        return attendance
    except Exception as e:
        logger.exception(f"Error fetching attendance for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/export/{format}")
async def export_session(session_id: str, format: str):
    """Export session attendance in CSV or PDF format"""
    try:
        # 1. Fetch session details
        session_resp = supabase.table("sessions").select("*").eq("id", session_id).single().execute()
        if not session_resp.data:
            raise HTTPException(status_code=404, detail="Session not found")
        session = session_resp.data
        
        # 2. Fetch attendance records
        attendance_resp = supabase.table("attendance_records")\
            .select("*, students(name, roll_no)")\
            .eq("session_id", session_id)\
            .execute()
        
        # 3. Prepare data for export
        data = []
        for record in attendance_resp.data:
            data.append({
                "Roll No": record["students"]["roll_no"],
                "Name": record["students"]["name"],
                "Marked At": record["created_at"]
            })
        
        df = pd.DataFrame(data)
        if df.empty:
            df = pd.DataFrame(columns=["Roll No", "Name", "Marked At"])
        else:
            df = df.sort_values("Roll No")

        filename = f"Attendance_{session['branch']}_{session['year']}_{session['division']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if format.lower() == "csv":
            stream = io.StringIO()
            df.to_csv(stream, index=False)
            response = StreamingResponse(
                iter([stream.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
            )
            return response

        elif format.lower() == "pdf":
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Arial", "B", 16)
            
            # Title
            pdf.cell(0, 10, f"Attendance Report - {session['subject']}", ln=True, align="C")
            pdf.set_font("Arial", "", 12)
            pdf.cell(0, 10, f"Branch: {session['branch']} | Year: {session['year']} | Div: {session['division']}", ln=True, align="C")
            pdf.cell(0, 10, f"Date: {session['created_at'][:10]}", ln=True, align="C")
            pdf.ln(10)
            
            # Table Header
            pdf.set_font("Arial", "B", 12)
            pdf.cell(40, 10, "Roll No", 1)
            pdf.cell(80, 10, "Name", 1)
            pdf.cell(60, 10, "Marked At", 1)
            pdf.ln()
            
            # Table Body
            pdf.set_font("Arial", "", 12)
            for _, row in df.iterrows():
                pdf.cell(40, 10, str(row["Roll No"]), 1)
                pdf.cell(80, 10, str(row["Name"]), 1)
                pdf.cell(60, 10, str(row["Marked At"])[:19], 1)
                pdf.ln()
            
            # Total
            pdf.ln(10)
            pdf.set_font("Arial", "B", 12)
            pdf.cell(0, 10, f"Total Students Present: {len(df)}", ln=True)

            pdf_output = pdf.output(dest='S')
            return Response(
                content=pdf_output,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
            )

        else:
            raise HTTPException(status_code=400, detail="Invalid format. Use 'csv' or 'pdf'.")

    except Exception as e:
        logger.exception(f"Error exporting session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
