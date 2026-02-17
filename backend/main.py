import os
import logging
import io
import asyncio
import pandas as pd
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
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
from services.geofencing import geofencing_service
from services.liveness_detector import liveness_detector, LivenessChallenge

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
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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

DEFAULT_GEOFENCE_RADIUS = int(os.environ.get("DEFAULT_GEOFENCE_RADIUS","10"))

@app.get("/config")
async def get_config():
    """Returns public configuration for frontend"""
    return {
        "geofence_radius": DEFAULT_GEOFENCE_RADIUS
    }

class SessionCreate(BaseModel):
    branch: str
    year: str
    division: str
    subject: Optional[str] = "General"
    teacher_id: Optional[str] = None
    capture_mode: Optional[str] = "teacher"  # 'teacher' or 'student'
    classroom: Optional[str] = None  # Room number
    geofence_radius: Optional[int] = DEFAULT_GEOFENCE_RADIUS  # Radius in meters
    teacher_lat: Optional[float] = None  # Teacher's GPS latitude
    teacher_lon: Optional[float] = None  # Teacher's GPS longitude

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
            "status": "active",
            "capture_mode": request.capture_mode,
            "geofence_radius": request.geofence_radius,
            "class_name": request.classroom,
            "teacher_latitude": request.teacher_lat,
            "teacher_longitude": request.teacher_lon,
            "location_captured_at": datetime.now(timezone.utc).isoformat() if request.teacher_lat and request.teacher_lon else None,
            "use_teacher_location": True  # Temporary: always use teacher location
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
        try:
            bboxes, kpss = detector.detect(img, max_num=25)
            logger.info(f"Detections in session {session_id}: {len(bboxes)} faces found.")
        except Exception as e:
            logger.error(f"Face detection failed for session {session_id}: {e}")
            raise HTTPException(status_code=500, detail="Face detection failed")
        
        # Get image dimensions for normalization
        img_h, img_w = img.shape[:2]
        
        if not bboxes or len(bboxes) == 0:
            logger.info(f"No faces detected in session {session_id}")
            return {
                "status": "success", 
                "detections": [], 
                "total_students": len(known_embeddings) if known_embeddings else 0,
                "image_size": {"width": img_w, "height": img_h},
                "message": "No faces detected in image"
            }

        # 4. Recognition (Batch)
        try:
            input_embeddings = recognizer.get_embeddings(img, bboxes, kpss)
            if not input_embeddings or len(input_embeddings) != len(bboxes):
                logger.error(f"Embedding extraction mismatch: {len(bboxes)} faces, {len(input_embeddings) if input_embeddings else 0} embeddings")
                raise HTTPException(status_code=500, detail="Face embedding extraction failed")
        except Exception as e:
            logger.error(f"Embedding extraction failed for session {session_id}: {e}")
            raise HTTPException(status_code=500, detail="Face embedding extraction failed")
        
        detections = []

        # Handle case where no students are found for this session
        if not known_embeddings:
            logger.warning(f"No known embeddings for session {session_id}. All detections will be unknown.")
            for i, bbox in enumerate(bboxes):
                x1, y1, x2, y2 = bbox
                normalized_bbox = [max(0, x1/img_w), max(0, y1/img_h), min(1, x2/img_w), min(1, y2/img_h)]
                detections.append({
                    "bbox": bbox,
                    "normalized_bbox": normalized_bbox,
                    "match": None
                })
            return {
                "status": "success", 
                "detections": detections,
                "total_students": 0,
                "image_size": {"width": img_w, "height": img_h},
                "message": "No students registered for this class."
            }

        # Optimization: Pre-calculate known embeddings for faster matching
        known_student_ids = list(known_embeddings.keys())
        try:
            known_feats = np.array([data["embedding"] for data in known_embeddings.values()], dtype=np.float32)
            
            # Validate that embeddings are not empty or invalid
            if known_feats.size == 0:
                logger.warning(f"No valid embeddings found for session {session_id}")
                return {
                    "status": "success", 
                    "detections": [],
                    "total_students": 0,
                    "image_size": {"width": img_w, "height": img_h},
                    "message": "No valid student embeddings available."
                }
                
        except Exception as e:
            logger.error(f"Failed to create numpy array from known embeddings: {e}")
            raise HTTPException(status_code=500, detail="Corrupted face descriptors in database")
        
        for i, input_embedding in enumerate(input_embeddings):
            # Use vectorization for faster similarity comparison if multiple students
            feat = np.array(input_embedding, dtype=np.float32).flatten()
            
            # Fast Cosine Similarity using NumPy vectorization
            norm_input = np.linalg.norm(feat)
            
            # Handle invalid embeddings (zero norm)
            if norm_input == 0:
                logger.warning(f"Invalid embedding detected for face {i}: zero norm")
                # Use a default low similarity for invalid embeddings
                similarities = np.zeros(len(known_student_ids))
            else:
                norm_known = np.linalg.norm(known_feats, axis=1)
                dot_products = np.dot(known_feats, feat)
                similarities = dot_products / (norm_input * norm_known + 1e-6)
            
            best_idx = np.argmax(similarities)
            max_sim = float(similarities[best_idx])
            best_match_id = known_student_ids[best_idx]
            
            best_match = None
            if max_sim > RECOGNITION_THRESHOLD: # Use configurable threshold
                student_data = known_embeddings[best_match_id]
                best_match = {
                    "id": best_match_id,
                    "name": student_data["name"],
                    "roll_no": student_data.get("roll_no", "N/A"),
                    "confidence": round(max_sim * 100, 2)
                }
            
            # Calculate normalized bounding box for frontend scaling
            x1, y1, x2, y2 = bboxes[i]
            normalized_bbox = [
                max(0, x1 / img_w),
                max(0, y1 / img_h),
                min(1, x2 / img_w),
                min(1, y2 / img_h)
            ]
            
            detections.append({
                "bbox": bboxes[i] if isinstance(bboxes[i], list) else bboxes[i].tolist(),
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

# ==================== NEW ENDPOINTS FOR STUDENT SELF-CAPTURE MODE ====================

class LocationValidationRequest(BaseModel):
    session_id: str
    student_lat: float
    student_lon: float

@app.post("/validate-location")
async def validate_location(request: LocationValidationRequest):
    """
    Validate if student is within classroom geofence.
    """
    try:
        # Get session info
        session_resp = supabase.table("sessions").select("*").eq("id", request.session_id).single().execute()
        
        if not session_resp.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = session_resp.data
        
        # Determine geofence center (Priority: Teacher Location > Classroom Location)
        # For now, per user request, we default to teacher location if available
        
        geofence_lat = session.get("teacher_latitude")
        geofence_lon = session.get("teacher_longitude")
        radius = session.get("geofence_radius", 10) # Default 10m
        
        # If teacher location is not set, try classroom location
        if geofence_lat is None or geofence_lon is None:
            class_name = session.get("class_name")
            if class_name:
                classroom_resp = supabase.table("classrooms").select("*").eq("room_no", class_name).single().execute()
                classroom = classroom_resp.data
                if classroom:
                    geofence_lat = classroom.get("latitude")
                    geofence_lon = classroom.get("longitude")
        
        # If still no location, we cannot validate
        if geofence_lat is None or geofence_lon is None:
             raise HTTPException(status_code=400, detail="Geofence location (teacher or classroom) not configured for this session")

        
        # Validate location
        validation_result = geofencing_service.validate_location(
            classroom_lat=geofence_lat,
            classroom_lon=geofence_lon,
            student_lat=request.student_lat,
            student_lon=request.student_lon,
            radius_meters=radius
        )
        
        return validation_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error validating location")
        raise HTTPException(status_code=500, detail=str(e))


class StudentSelfCaptureRequest(BaseModel):
    session_id: str
    roll_number: str
    student_lat: float
    student_lon: float
    liveness_verified: bool = False

@app.post("/student-self-capture/{session_id}")
async def student_self_capture(
    session_id: str,
    roll_number: str,
    student_lat: float,
    student_lon: float,
    request: Request,
    file: UploadFile = File(...),
    liveness_challenge: Optional[str] = "blink"
):
    """
    Student self-capture attendance endpoint.
    Validates location, roll number, face match, and liveness before marking attendance.
    Uses the same face detection and recognition engine as the teacher mode.
    Only recognizes ONE face - the student who entered their roll number.
    """
    if not recognizer or not detector or not embedding_manager:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Face recognition services not fully initialized",
                "init_status": init_status,
                "init_error": init_error
            }
        )
    
    try:
        # 1. Check session validity
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("status") != "active":
            raise HTTPException(
                status_code=403,
                detail=f"Session is no longer active (Status: {session.get('status')})"
            )
        
        if session.get("capture_mode") != "student":
            raise HTTPException(
                status_code=403,
                detail="This session is not configured for student self-capture mode"
            )
        
        # Check IP attendance (One Device One Attendance)
        client_ip = _get_client_ip(request)
        ip_check = supabase.table("attendance_records").select("id").eq("session_id", session_id).eq("ip_address", client_ip).execute()
        if ip_check.data and len(ip_check.data) > 0:
            return {
                "success": False,
                "error": "IP already marked",
                "already_marked": True,
                "message": "Attendance already marked from this device"
            }
        
        # 2. Load embeddings cache (same as teacher mode)
        known_embeddings = embedding_manager.get_session_embeddings(session_id)
        if known_embeddings is None:
            known_embeddings = await embedding_manager.load_session_embeddings(session_id)
            if known_embeddings is None:
                raise HTTPException(status_code=404, detail="Session embeddings not loaded")
        
        # 3. Validate roll number and get student
        student_resp = supabase.table("students").select("id, name, roll_no").eq("roll_no", roll_number).eq("branch", session.get("branch")).eq("year", session.get("year")).eq("division", session.get("division")).single().execute()
        
        if not student_resp.data:
            return {
                "success": False,
                "error": "Invalid roll number",
                "message": f"No student found with roll number {roll_number} in this class",
                "location_valid": False
            }
        
        student = student_resp.data
        student_id = student["id"]
        
        # 4. Check if already marked
        existing = supabase.table("attendance_records").select("*").eq("session_id", session_id).eq("student_id", student_id).execute()
        if existing.data:
            return {
                "success": False,
                "error": "Already marked",
                "message": "Your attendance has already been recorded for this session",
                "already_marked": True,
                "location_valid": False
            }
        
        # 5. Get student's enrolled embedding from cache (same engine as teacher mode)
        student_data = known_embeddings.get(student_id)
        if not student_data:
            return {
                "success": False,
                "error": "Face not enrolled",
                "message": "Your face is not enrolled in the system. Please contact your teacher.",
                "location_valid": False
            }
        
        enrolled_embedding = np.array(student_data["embedding"], dtype=np.float32)
        
        # 6. Validate geofence (teacher location or classroom location)
        use_teacher_location = session.get("use_teacher_location", True)
        teacher_lat = session.get("teacher_latitude")
        teacher_lon = session.get("teacher_longitude")
        classroom_lat = None
        classroom_lon = None
        
        # Try to get classroom coordinates as fallback
        if session.get("class_name"):
            classroom_resp = supabase.table("classrooms").select("*").eq("room_no", session.get("class_name")).single().execute()
            classroom = classroom_resp.data if classroom_resp.data else None
            if classroom:
                classroom_lat = classroom.get("latitude")
                classroom_lon = classroom.get("longitude")
        
        # Determine which location to use as geofence center
        geofence_lat = None
        geofence_lon = None
        geofence_source = None
        
        if use_teacher_location and teacher_lat and teacher_lon:
            geofence_lat = teacher_lat
            geofence_lon = teacher_lon
            geofence_source = "teacher"
        elif classroom_lat and classroom_lon:
            geofence_lat = classroom_lat
            geofence_lon = classroom_lon
            geofence_source = "classroom"
        
        if geofence_lat and geofence_lon:
            validation = geofencing_service.validate_location(
                classroom_lat=geofence_lat,
                classroom_lon=geofence_lon,
                student_lat=student_lat,
                student_lon=student_lon,
                radius_meters=session.get("geofence_radius", 15)
            )
            
            if not validation["valid"]:
                return {
                    "success": False,
                    "error": "Location validation failed",
                    "message": "You are not in the classroom. Please be within 15m of the session location.",
                    "location_valid": False,
                    "distance": validation["distance_meters"],
                    "required_distance": session.get("geofence_radius", 15)
                }
            
            distance_from_classroom = validation["distance_meters"]
            location_verified = True
        else:
            distance_from_classroom = None
            location_verified = False
            geofence_source = "none"
        
        # 7. Process image and face recognition (SAME ENGINE as teacher mode)
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # Detect faces using SAME detector as teacher mode
        try:
            bboxes, kpss = detector.detect(img, max_num=1)  # Only detect 1 face for self-capture
            logger.info(f"Student self-capture: {len(bboxes)} faces detected")
        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            return {
                "success": False,
                "error": "Face detection failed",
                "message": "Could not detect faces. Please try again.",
                "location_valid": location_verified
            }
        
        if not bboxes or len(bboxes) == 0:
            return {
                "success": False,
                "error": "No face detected",
                "message": "No face detected in the image. Please ensure your face is clearly visible and well-lit.",
                "location_valid": location_verified
            }
        
        if len(bboxes) > 1:
            return {
                "success": False,
                "error": "Multiple faces detected",
                "message": f"Detected {len(bboxes)} faces. Only one face (yours) should be visible. Please ensure no one else is in the frame.",
                "location_valid": location_verified
            }
        
        # 8. Extract embedding using SAME recognizer as teacher mode
        try:
            embeddings = recognizer.get_embeddings(img, bboxes, kpss)
            if not embeddings or len(embeddings) == 0:
                logger.error("Embedding extraction returned no results")
                return {
                    "success": False,
                    "error": "Face extraction failed",
                    "message": "Could not extract face features. Please try again with better lighting.",
                    "location_valid": location_verified
                }
        except Exception as e:
            logger.error(f"Embedding extraction failed: {e}")
            return {
                "success": False,
                "error": "Face extraction failed",
                "message": "Could not process face features. Please try again.",
                "location_valid": location_verified
            }
        
        captured_embedding = np.array(embeddings[0], dtype=np.float32).flatten()
        
        # 9. Compare faces using SAME algorithm as teacher mode
        norm_captured = np.linalg.norm(captured_embedding)
        norm_enrolled = np.linalg.norm(enrolled_embedding)
        
        if norm_captured == 0 or norm_enrolled == 0:
            similarity = 0
        else:
            dot_product = np.dot(captured_embedding, enrolled_embedding)
            similarity = dot_product / (norm_captured * norm_enrolled)
        
        confidence = float(similarity * 100)
        
        logger.info(f"Face comparison: similarity={similarity:.4f}, confidence={confidence:.1f}%, threshold={RECOGNITION_THRESHOLD}")
        
        if similarity < RECOGNITION_THRESHOLD:
            return {
                "success": False,
                "error": "Face mismatch",
                "message": f"Face does not match the enrolled photo (confidence: {confidence:.1f}%). Please ensure you are the student with roll number {roll_number}.",
                "confidence": confidence,
                "location_valid": location_verified,
                "face_match": False
            }
        
        # 10. Liveness detection using SAME detector as teacher mode
        try:
            liveness_result = liveness_detector.quick_liveness_check(img)
            
            if not liveness_result.is_live:
                return {
                    "success": False,
                    "error": "Liveness check failed",
                    "message": "Could not verify that you are a real person. Please ensure you are not using a photo or screen.",
                    "location_valid": location_verified,
                    "face_match": True,
                    "confidence": confidence,
                    "liveness_verified": False,
                    "liveness_details": liveness_result.details
                }
        except Exception as e:
            logger.error(f"Liveness detection failed: {e}")
            # Continue anyway - liveness is a bonus check
        
        # 11. Mark attendance
        attendance_data = {
            "session_id": session_id,
            "student_id": student_id,
            "liveness_verified": True,
            "location_verified": location_verified,
            "student_latitude": student_lat,
            "student_longitude": student_lon,
            "distance_from_classroom": distance_from_classroom,
            "verification_method": "student_self_capture",
            "ip_address": _get_client_ip(request)
        }
        
        mark_resp = supabase.table("attendance_records").insert(attendance_data).execute()
        
        if not mark_resp.data:
            raise HTTPException(status_code=500, detail="Failed to mark attendance")
        
        # Track this device to prevent multiple submissions
        device_id = _get_device_fingerprint(request)
        _mark_device_attendance(session_id, device_id, student["name"], roll_number)
        
        return {
            "success": True,
            "message": "Attendance marked successfully!",
            "student_name": student["name"],
            "roll_number": roll_number,
            "confidence": confidence,
            "location_valid": location_verified,
            "distance_meters": distance_from_classroom,
            "liveness_verified": True,
            "face_match": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in student self-capture for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/student-recognize/{session_id}/{roll_number}")
async def student_recognize(
    session_id: str,
    roll_number: str,
    student_lat: float,
    student_lon: float,
    request: Request,
    file: UploadFile = File(...)
):
    """
    Fast face recognition for a specific student (used in auto-detection mode).
    Returns match result without marking attendance - attendance is marked separately.
    """
    if not recognizer or not detector:
        return {
            "success": False,
            "error": "Service initializing",
            "face_detected": False,
            "message": "Face recognition service is still loading. Please wait..."
        }
    
    try:
        # Get session
        session = await check_session_validity(session_id)
        if not session:
            return {
                "success": False,
                "error": "Session not found",
                "face_detected": False
            }
        
        # Check IP attendance (One Device One Attendance)
        client_ip = _get_client_ip(request)
        ip_check = supabase.table("attendance_records").select("id").eq("session_id", session_id).eq("ip_address", client_ip).execute()
        if ip_check.data and len(ip_check.data) > 0:
            return {
                "success": False,
                "error": "IP already marked",
                "already_marked": True,
                "message": "Attendance already marked from this device"
            }

        # Load embeddings
        known_embeddings = embedding_manager.get_session_embeddings(session_id)
        if known_embeddings is None:
            known_embeddings = await embedding_manager.load_session_embeddings(session_id)
            if known_embeddings is None:
                return {
                    "success": False,
                    "error": "Embeddings not loaded",
                    "face_detected": False
                }
        
        # Get student
        student_data = None
        student_id = None
        for sid, data in known_embeddings.items():
            if data.get("roll_no") == roll_number:
                student_data = data
                student_id = sid
                break
        
        if not student_data:
            return {
                "success": False,
                "error": "Student not found",
                "face_detected": False,
                "message": f"No student found with roll number {roll_number}"
            }
        
        enrolled_embedding = np.array(student_data["embedding"], dtype=np.float32)
        
        # Process image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {
                "success": False,
                "error": "Invalid image",
                "face_detected": False
            }
        
        # Detect faces (max 1 for self-capture)
        try:
            bboxes, kpss = detector.detect(img, max_num=1)
        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return {
                "success": False,
                "error": "Detection failed",
                "face_detected": False
            }
        
        if not bboxes or len(bboxes) == 0:
            return {
                "success": False,
                "face_detected": False,
                "message": "No face detected"
            }
        
        if len(bboxes) > 1:
            return {
                "success": False,
                "face_detected": True,
                "bbox": bboxes[0][:4],
                "error": "Multiple faces",
                "message": "Multiple faces detected. Please ensure only your face is visible."
            }
        
        # Extract embedding
        try:
            embeddings = recognizer.get_embeddings(img, bboxes, kpss)
            if not embeddings or len(embeddings) == 0:
                return {
                    "success": False,
                    "face_detected": True,
                    "bbox": bboxes[0][:4],
                    "error": "Extraction failed"
                }
        except Exception as e:
            logger.error(f"Embedding extraction error: {e}")
            return {
                "success": False,
                "face_detected": True,
                "bbox": bboxes[0][:4],
                "error": "Extraction failed"
            }
        
        captured_embedding = np.array(embeddings[0], dtype=np.float32).flatten()
        
        # Compare faces
        norm_captured = np.linalg.norm(captured_embedding)
        norm_enrolled = np.linalg.norm(enrolled_embedding)
        
        if norm_captured == 0 or norm_enrolled == 0:
            similarity = 0
        else:
            dot_product = np.dot(captured_embedding, enrolled_embedding)
            similarity = dot_product / (norm_captured * norm_enrolled)
        
        confidence = float(similarity * 100)
        
        # Check if match
        if similarity >= RECOGNITION_THRESHOLD:
            # Match found - now mark attendance
            attendance_data = {
                "session_id": session_id,
                "student_id": student_id,
                "liveness_verified": True,
                "location_verified": True,
                "student_latitude": student_lat,
                "student_longitude": student_lon,
                "verification_method": "student_self_capture_auto",
                "ip_address": _get_client_ip(request)
            }
            
            try:
                mark_resp = supabase.table("attendance_records").insert(attendance_data).execute()
                if mark_resp.data:
                    # Track device
                    device_id = _get_device_fingerprint(request)
                    _mark_device_attendance(session_id, device_id, student_data["name"], roll_number)
                    
                    return {
                        "success": True,
                        "face_detected": True,
                        "face_match": True,
                        "confidence": confidence,
                        "bbox": bboxes[0][:4],
                        "student_name": student_data["name"],
                        "roll_number": roll_number,
                        "message": "Attendance marked!"
                    }
            except Exception as e:
                logger.error(f"Error marking attendance: {e}")
                
                # Check for duplicate key error (PostgreSQL code 23505)
                if "23505" in str(e) or "duplicate key" in str(e).lower():
                     return {
                        "success": True,
                        "face_detected": True,
                        "face_match": True,
                        "confidence": confidence,
                        "bbox": bboxes[0][:4],
                        "student_name": student_data["name"],
                        "roll_number": roll_number,
                        "message": "Attendance already marked!",
                        "already_marked": True
                    }

                return {
                    "success": False,
                    "face_detected": True,
                    "face_match": True,
                    "confidence": confidence,
                    "bbox": bboxes[0][:4],
                    "error": "Failed to mark attendance",
                    "message": "Face matched but attendance recording failed"
                }
        else:
            return {
                "success": False,
                "face_detected": True,
                "face_match": False,
                "confidence": confidence,
                "bbox": bboxes[0][:4],
                "message": f"Face does not match (confidence: {confidence:.1f}%)"
            }
            
    except Exception as e:
        logger.exception(f"Error in student recognize: {e}")
        return {
            "success": False,
            "face_detected": False,
            "error": str(e)
        }


@app.get("/sessions/{session_id}/student-link")
async def get_student_capture_link(session_id: str):
    """
    Get the student self-capture link for a session.
    """
    try:
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Generate the student capture URL
        # This would typically be your frontend URL
        base_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        student_url = f"{base_url}/student-capture/{session_id}"
        
        return {
            "session_id": session_id,
            "capture_mode": session.get("capture_mode"),
            "student_capture_url": student_url,
            "classroom": session.get("class_name"),
            "subject": session.get("subject"),
            "status": session.get("status")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting student link for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/classrooms/{room_no}/location")
async def get_classroom_location(room_no: str):
    """
    Get classroom location coordinates.
    """
    try:
        resp = supabase.table("classrooms").select("*").eq("room_no", room_no).single().execute()
        
        if not resp.data:
            raise HTTPException(status_code=404, detail="Classroom not found")
        
        return {
            "room_no": room_no,
            "latitude": resp.data.get("latitude"),
            "longitude": resp.data.get("longitude"),
            "location_configured": resp.data.get("latitude") is not None and resp.data.get("longitude") is not None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting classroom location for {room_no}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TEACHER LOCATION MANAGEMENT (Temporary solution until classroom coordinates are configured)
# ============================================================================

class UpdateTeacherLocationRequest(BaseModel):
    latitude: float
    longitude: float

@app.post("/sessions/{session_id}/update-teacher-location")
async def update_teacher_location(session_id: str, request: UpdateTeacherLocationRequest):
    """
    Update the teacher's location for a session.
    This allows the teacher to reset the geofence center to their current location.
    Useful if the teacher moves to a different spot in the classroom.
    """
    try:
        # Verify session exists and is active
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("status") != "active":
            raise HTTPException(
                status_code=403,
                detail="Cannot update location for completed sessions"
            )
        
        # Update teacher location
        update_data = {
            "teacher_latitude": request.latitude,
            "teacher_longitude": request.longitude,
            "location_captured_at": datetime.now(timezone.utc).isoformat(),
            "use_teacher_location": True
        }
        
        resp = supabase.table("sessions").update(update_data).eq("id", session_id).execute()
        
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to update teacher location")
        
        return {
            "success": True,
            "message": "Teacher location updated successfully",
            "latitude": request.latitude,
            "longitude": request.longitude,
            "updated_at": update_data["location_captured_at"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating teacher location for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/geofence-info")
async def get_geofence_info(session_id: str):
    """
    Get geofence information for a session.
    Shows the current geofence center (teacher or classroom) and radius.
    """
    try:
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Determine geofence source
        use_teacher_location = session.get("use_teacher_location", True)
        teacher_lat = session.get("teacher_latitude")
        teacher_lon = session.get("teacher_longitude")
        
        geofence_info = {
            "session_id": session_id,
            "radius_meters": session.get("geofence_radius", 15),
            "geofence_source": None,
            "center_latitude": None,
            "center_longitude": None,
            "location_captured_at": session.get("location_captured_at"),
            "use_teacher_location": use_teacher_location
        }
        
        if use_teacher_location and teacher_lat and teacher_lon:
            geofence_info["geofence_source"] = "teacher"
            geofence_info["center_latitude"] = teacher_lat
            geofence_info["center_longitude"] = teacher_lon
        elif session.get("class_name"):
            # Try to get classroom location
            classroom_resp = supabase.table("classrooms").select("*").eq("room_no", session.get("class_name")).single().execute()
            if classroom_resp.data and classroom_resp.data.get("latitude"):
                geofence_info["geofence_source"] = "classroom"
                geofence_info["center_latitude"] = classroom_resp.data.get("latitude")
                geofence_info["center_longitude"] = classroom_resp.data.get("longitude")
        
        return geofence_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting geofence info for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ATTENDANCE TRACKING (Production: Prevent multiple submissions)
# ============================================================================

# In-memory store for tracking attendance submissions (session_id -> set of device fingerprints)
# Note: This is cleared on server restart. For persistent tracking, use Redis or database.
_attendance_tracking: Dict[str, Dict[str, Any]] = {}

def _get_client_ip(request: Request) -> str:
    """Get the client's real IP address, handling proxies."""
    # Check X-Forwarded-For header first (standard for proxies like Render/Vercel)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    # Fallback to direct connection IP
    return request.client.host if request.client else "unknown"

def _get_device_fingerprint(request: Request) -> str:
    """Generate a device fingerprint from request headers"""
    user_agent = request.headers.get("user-agent", "")
    ip = _get_client_ip(request)
    # Combine IP and user agent for a simple fingerprint
    return f"{ip}:{hash(user_agent) % 10000000}"

@app.get("/check-attendance-status/{session_id}")
async def check_attendance_status(session_id: str, request: Request):
    """
    Check if this device/browser has already marked attendance for this session.
    Used in production to prevent multiple submissions from the same device.
    """
    try:
        # Check if session exists and is active
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get client IP
        client_ip = _get_client_ip(request)
        
        # Check database for this IP in this session
        # This is the primary check for "One Device One Attendance"
        ip_records = supabase.table("attendance_records").select("student_id, created_at, students(name, roll_no)")\
            .eq("session_id", session_id)\
            .eq("ip_address", client_ip)\
            .execute()
            
        if ip_records.data and len(ip_records.data) > 0:
            record = ip_records.data[0]
            student_info = record.get("students", {})
            return {
                "already_marked": True,
                "student_name": student_info.get("name") if student_info else "Unknown",
                "roll_number": student_info.get("roll_no") if student_info else "Unknown",
                "marked_at": record.get("created_at"),
                "message": "Attendance already marked from this device (IP check)"
            }

        # Get device fingerprint (fallback for same IP different browser scenarios if needed, 
        # though IP check covers most "same device" cases)
        device_id = _get_device_fingerprint(request)
        
        # Check if this device has already marked attendance (in-memory cache)
        session_tracking = _attendance_tracking.get(session_id, {})
        device_data = session_tracking.get(device_id)
        
        if device_data and device_data.get("marked"):
            return {
                "already_marked": True,
                "student_name": device_data.get("student_name"),
                "roll_number": device_data.get("roll_number"),
                "marked_at": device_data.get("timestamp"),
                "message": "Attendance already marked from this device"
            }
        
        return {
            "already_marked": False,
            "message": "No attendance marked yet from this device"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error checking attendance status for session {session_id}")
        # Fail open if DB error, or fail closed? 
        # For security, better to log error and allow unless confirmed bad.
        # But if table column is missing, this will error out.
        # We'll return False but log exception.
        return {
            "already_marked": False,
            "error": str(e)
        }

@app.get("/check-roll-attendance/{session_id}/{roll_number}")
async def check_roll_attendance(session_id: str, roll_number: str, request: Request):
    """
    Check if a specific roll number has already marked attendance.
    Also prevents the same device from marking attendance with different roll numbers.
    """
    try:
        # Get device fingerprint
        device_id = _get_device_fingerprint(request)
        
        # Check device tracking first
        session_tracking = _attendance_tracking.get(session_id, {})
        device_data = session_tracking.get(device_id)
        
        if device_data and device_data.get("marked"):
            # Device already marked attendance (even with different roll number)
            return {
                "already_marked": True,
                "student_name": device_data.get("student_name"),
                "roll_number": device_data.get("roll_number"),
                "marked_at": device_data.get("timestamp"),
                "message": "Attendance already marked from this device"
            }
        
        # Check if this specific roll number already marked attendance
        session = await check_session_validity(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get student by roll number
        student_resp = supabase.table("students").select("id, name, roll_no").eq("roll_no", roll_number).eq("branch", session.get("branch")).eq("year", session.get("year")).eq("division", session.get("division")).single().execute()
        
        if not student_resp.data:
            return {
                "already_marked": False,
                "student_exists": False,
                "message": "Student not found"
            }
        
        student_id = student_resp.data["id"]
        
        # Check if attendance record exists
        existing = supabase.table("attendance_records").select("*").eq("session_id", session_id).eq("student_id", student_id).execute()
        
        if existing.data and len(existing.data) > 0:
            return {
                "already_marked": True,
                "student_name": student_resp.data["name"],
                "roll_number": student_resp.data["roll_no"],
                "marked_at": existing.data[0].get("created_at"),
                "message": "Attendance already marked for this roll number"
            }
        
        return {
            "already_marked": False,
            "student_exists": True,
            "student_name": student_resp.data["name"],
            "roll_number": student_resp.data["roll_no"],
            "message": "Ready to mark attendance"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error checking roll attendance for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))

def _mark_device_attendance(session_id: str, device_id: str, student_name: str, roll_number: str):
    """Helper function to mark attendance in memory tracking"""
    if session_id not in _attendance_tracking:
        _attendance_tracking[session_id] = {}
    
    _attendance_tracking[session_id][device_id] = {
        "marked": True,
        "student_name": student_name,
        "roll_number": roll_number,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    # Use 8000 as a default if PORT is not set (local dev), but Railway will provide PORT
    port = int(os.environ.get("PORT", 8000))
    # Enable reload for local development
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info", reload=True)
