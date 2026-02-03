import os
import logging
import io
import asyncio
import pandas as pd
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import List, Optional
from fpdf import FPDF

import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException, Response, Request
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
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("FBA-Backend")

load_dotenv()

# Global Service Instances
detector = None
recognizer = None
embedding_manager = None
init_error = None
init_status = "pending"

# Configuration from Environment Variables
# Using high-accuracy models from public-data/insightface
def clean_env(key, default=None):
    val = os.environ.get(key, default)
    if val:
        # Remove newlines, carriage returns, and leading/trailing whitespace
        return val.replace('\n', '').replace('\r', '').strip()
    return val

HF_REPO = clean_env("HF_REPO", "public-data/insightface")
DET_MODEL_FILE = clean_env("DET_MODEL_FILE", "models/buffalo_l/det_10g.onnx")
REC_MODEL_FILE = clean_env("REC_MODEL_FILE", "models/buffalo_l/w600k_r50.onnx")
RECOGNITION_THRESHOLD = float(os.environ.get("RECOGNITION_THRESHOLD", "0.45"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, recognizer, embedding_manager, init_status
    logger.info("Starting FBA Backend...")
    
    # Start model loading in the background so the server can start immediately
    logger.info("Scheduling background initialization...")
    init_status = "initializing"
    loop = asyncio.get_event_loop()
    loop.call_later(1, lambda: asyncio.create_task(initialize_services()))
    
    yield
    # Shutdown logic
    logger.info("Shutting down FBA Backend...")
    if embedding_manager:
        embedding_manager.clear_cache()

async def initialize_services():
    global detector, recognizer, embedding_manager, init_error, init_status
    try:
        # Log the actual model files being used
        logger.info(f"Background initialization starting with models: '{DET_MODEL_FILE}' and '{REC_MODEL_FILE}'")
        logger.info(f"Downloading models from HF: '{HF_REPO}' in background...")
        # Use run_in_executor for sync hf_hub_download
        loop = asyncio.get_event_loop()
        
        # Download sequentially to avoid memory spike
        try:
            det_path = await loop.run_in_executor(None, lambda: hf_hub_download(repo_id=HF_REPO, filename=DET_MODEL_FILE))
            logger.info(f"Detector model downloaded to: {det_path}")
        except Exception as e:
            logger.error(f"Failed to download detector model: {e}")
            raise

        try:
            rec_path = await loop.run_in_executor(None, lambda: hf_hub_download(repo_id=HF_REPO, filename=REC_MODEL_FILE))
            logger.info(f"Recognizer model downloaded to: {rec_path}")
        except Exception as e:
            logger.error(f"Failed to download recognizer model: {e}")
            raise
        
        # Initialize services one by one
        detector = FaceDetector(det_path)
        logger.info("Detector initialized.")
        
        recognizer = FaceRecognizer(rec_path)
        logger.info("Recognizer initialized.")
        
        embedding_manager = EmbeddingManager(supabase)
        logger.info("Embedding manager initialized.")
        
        init_status = "ready"
        logger.info("All services initialized successfully in background.")
    except Exception as e:
        init_status = "error"
        init_error = str(e)
        logger.error(f"Failed to initialize services in background: {e}")

app = FastAPI(title="FBA Backend", lifespan=lifespan)

# Enable CORS
# ALLOWED_ORIGINS must be set in the environment variables (comma-separated list)
# Example: ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    # Production healthcheck for monitoring systems
    return {
        "status": "ok", 
        "init_status": init_status,
        "init_error": init_error,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/retry-init")
async def retry_init():
    global init_status
    if init_status in ["error", "pending"]:
        asyncio.create_task(initialize_services())
        return {"message": "Initialization retrying..."}
    return {"message": f"Initialization status is {init_status}"}

async def check_session_validity(session_id: str):
    """
    Checks if a session is valid (active and < 1 hour old).
    If it's older than 1 hour, updates its status to 'completed' in the database.
    Returns the session data or None if not found.
    """
    try:
        resp = supabase.table("sessions").select("*").eq("id", session_id).execute()
        if not resp.data:
            return None
        
        session = resp.data[0]
        if session.get("status") != "active":
            return session
            
        # Check time limit (1 hour)
        created_at_str = session.get("created_at")
        if created_at_str:
            # Supabase returns ISO format strings
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            
            if now - created_at > timedelta(hours=1):
                logger.info(f"Session {session_id} expired (created at {created_at_str}). Closing it.")
                # Update DB
                supabase.table("sessions").update({"status": "completed"}).eq("id", session_id).execute()
                session["status"] = "completed"
                # Clear cache
                if embedding_manager:
                    embedding_manager.clear_cache(session_id)
        
        return session
    except Exception as e:
        logger.error(f"Error checking session validity for {session_id}: {e}")
        return None

@app.get("/")
async def root():
    return {"message": "FBA Backend is running"}

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
        raise HTTPException(
            status_code=503, 
            detail={
                "message": "Embedding manager not initialized",
                "init_status": init_status,
                "init_error": init_error
            }
        )

    try:
        # 1. Insert session into Supabase
        # Note: The schema for attendance_sessions might require class_id instead of branch/year/division
        # We'll need to find the class_id first or ensure the table supports these fields.
        # Based on previous investigation, the table is likely 'attendance_sessions'.
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
        
        count = len(embeddings) if embeddings else 0
        if count == 0:
            logger.warning(f"Session {session_id} created but NO students found for {request.branch} {request.year} {request.division}")
        
        return {
            "status": "success",
            "session_id": session_id,
            "descriptors_loaded": count,
            "message": "Session created. WARNING: No students found in this class." if count == 0 else "Session created successfully."
        }
    except Exception as e:
        logger.exception("Error in create_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load-session-embeddings/{session_id}")
async def load_session_embeddings(session_id: str):
    if not embedding_manager:
        raise HTTPException(
            status_code=503, 
            detail={
                "message": "Embedding manager not initialized",
                "init_status": init_status,
                "init_error": init_error
            }
        )
    
    embeddings = await embedding_manager.load_session_embeddings(session_id)
    if embeddings is None:
        raise HTTPException(status_code=404, detail="Session not found or error loading embeddings")
    
    return {"status": "success", "count": len(embeddings)}

@app.get("/sessions/{session_id}/check-access")
async def check_access(session_id: str, request: Request):
    """Simplified access check (Device lock removed)"""
    try:
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        status = session.get("status")
        if status != "active":
            return {"status": "denied", "message": "Session is no longer active."}
            
        return {"status": "allowed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error checking access for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recognize/{session_id}")
async def recognize(session_id: str, request: Request, file: UploadFile = File(...)):
    if not recognizer or not detector or not embedding_manager:
        raise HTTPException(
            status_code=503, 
            detail={
                "message": "Face recognition services not fully initialized",
                "init_status": init_status,
                "init_error": init_error
            }
        )
    
    # 1. Check if session is active
    try:
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("status") != "active":
             raise HTTPException(
                 status_code=403, 
                 detail=f"Session is no longer active (Status: {session.get('status')}). Attendance cannot be marked."
             )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking session status for {session_id}: {e}")
        # If we can't check status, we should probably not proceed
        raise HTTPException(status_code=500, detail="Error verifying session status")

    # 2. Load cache if missing
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
        
        # 3. Detection (All faces - up to 25)
        bboxes, kpss = detector.detect(img, max_num=25)
        
        logger.info(f"Detections in session {session_id}: {len(bboxes)} faces found.")
        
        if not bboxes:
            return {"status": "success", "detections": [], "message": "No faces detected"}

        # 4. Recognition (Batch)
        input_embeddings = recognizer.get_embeddings(img, bboxes, kpss)
        
        logger.info(f"Generated {len(input_embeddings)} embeddings for comparison.")
        if known_embeddings:
            logger.info(f"Comparing against {len(known_embeddings)} known students.")
        else:
            logger.warning("No known embeddings loaded for this session.")

        detections = []
        img_h, img_w = img.shape[:2]

        for i, input_embedding in enumerate(input_embeddings):
            matches = []
            max_sim = -1.0
            best_match_id = None
            
            for student_id, data in known_embeddings.items():
                similarity = recognizer.compute_similarity(input_embedding, data["embedding"])
                if similarity > max_sim:
                    max_sim = similarity
                    best_match_id = student_id
                
                if similarity > RECOGNITION_THRESHOLD:
                    matches.append({
                        "id": student_id, 
                        "name": data["name"], 
                        "roll_no": data["roll_no"],
                        "similarity": float(similarity)
                    })
            
            logger.info(f"Face {i}: Best similarity found: {max_sim:.4f} (Threshold: {RECOGNITION_THRESHOLD})")
            if matches:
                logger.info(f"Face {i}: Found {len(matches)} matches above threshold.")
            
            matches.sort(key=lambda x: x["similarity"], reverse=True)
            
            best_match = None
            if matches:
                best_match = matches[0]
            
            # Normalize bbox coordinates for universal display
            x1, y1, x2, y2 = bboxes[i]
            normalized_bbox = [
                float(x1 / img_w),
                float(y1 / img_h),
                float(x2 / img_w),
                float(y2 / img_h)
            ]
            
            detections.append({
                "bbox": bboxes[i],
                "normalized_bbox": normalized_bbox,
                "match": best_match
            })

        # 3. Asynchronous Attendance Marking for all unique best matches
        to_mark = {}
        for d in detections:
            if d["match"]:
                to_mark[d["match"]["id"]] = d["match"]

        async def mark_student(student_id, match_info):
            try:
                # Mark attendance (Unique constraint in DB handles duplicates)
                insert_data = {
                    "session_id": session_id,
                    "student_id": student_id
                }
                # Use a single insert attempt - unique constraint handles concurrency
                try:
                    mark_resp = supabase.table("attendance_records").insert(insert_data).execute()
                    return "marked_now"
                except Exception as e:
                    # Check if it's a duplicate key error (code 23505 in Postgres)
                    error_msg = str(e).lower()
                    if "duplicate key" in error_msg or "23505" in error_msg:
                        return "already_marked"
                    raise e
            except Exception as e:
                logger.error(f"Failed to mark student {student_id}: {e}")
                return "error"

        student_ids = list(to_mark.keys())
        if student_ids:
            results = await asyncio.gather(*[mark_student(sid, to_mark[sid]) for sid in student_ids])
            # Update match info with status
            for sid, status in zip(student_ids, results):
                to_mark[sid]["status"] = status
                # Also update detections array for frontend
                for d in detections:
                    if d["match"] and d["match"]["id"] == sid:
                        d["match"]["status"] = status

        return {
            "status": "success", 
            "detections": detections,
            "total_students": len(known_embeddings) if known_embeddings else 0,
            "image_size": {"width": img_w, "height": img_h}
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
        sessions = resp.data
        
        # Auto-close expired sessions
        now = datetime.now(timezone.utc)
        updated = False
        for session in sessions:
            if session.get("status") == "active":
                created_at_str = session.get("created_at")
                if created_at_str:
                    created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    if now - created_at > timedelta(hours=1):
                        logger.info(f"Closing expired session {session['id']} during fetch")
                        supabase.table("sessions").update({"status": "completed"}).eq("id", session["id"]).execute()
                        session["status"] = "completed"
                        updated = True
        
        return sessions
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
    # Use 8000 as a default if PORT is not set (local dev), but Railway will provide PORT
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
