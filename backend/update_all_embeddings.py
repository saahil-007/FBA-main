import os
import json
import logging
import asyncio
import numpy as np
import cv2
from supabase import create_client, Client
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
from services.face_detector import FaceDetector
from services.face_recognizer import FaceRecognizer

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("Embeddings-Updater")

load_dotenv()

# HF Repo for models
HF_REPO = "public-data/insightface"
DET_MODEL_FILE = "models/buffalo_l/det_10g.onnx"
REC_MODEL_FILE = "models/buffalo_l/w600k_r50.onnx"

async def update_all_embeddings():
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Missing Supabase configuration")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    logger.info("Downloading models...")
    det_path = hf_hub_download(repo_id=HF_REPO, filename=DET_MODEL_FILE)
    rec_path = hf_hub_download(repo_id=HF_REPO, filename=REC_MODEL_FILE)
    
    logger.info("Initializing services...")
    detector = FaceDetector(det_path)
    recognizer = FaceRecognizer(rec_path)
    
    logger.info("Fetching all students...")
    students_resp = supabase.table("students").select("*").execute()
    students = students_resp.data
    
    if not students:
        logger.info("No students found.")
        return

    logger.info(f"Processing {len(students)} students...")
    
    updated_count = 0
    failed_count = 0
    
    for student in students:
        student_id = student["id"]
        student_name = student.get("name", "Unknown")
        roll_no = student.get("roll_no")
        branch = student.get("branch", "COMPUTER")
        year = student.get("year", "TE")
        division = student.get("division", "A")

        logger.info(f"Processing student: {student_name} ({roll_no})")
        
        try:
            
            # Try a few variations of the path
            possible_paths = [
                f"{branch}/{year} 2025-26/{division}/{roll_no}/{roll_no}.jpg",
                f"{branch}/{year} 2025-26/{division}/{roll_no}.jpg",
                f"{branch}/{year}/{division}/{roll_no}/{roll_no}.jpg",
                f"{branch}/{year}/{division}/{roll_no}.jpg",
                f"{roll_no}.jpg",
                f"{student_id}.jpg"
            ]
            
            img_data = None
            for path in possible_paths:
                try:
                    # Use student_faces (underscore)
                    img_data = supabase.storage.from_("student_faces").download(path)
                    if img_data:
                        logger.info(f"Found image at: {path}")
                        break
                except:
                    continue
            
            if not img_data:
                logger.error(f"No image found for {student_name} in any expected path.")
                failed_count += 1
                continue
                
            # Decode image
            nparr = np.frombuffer(img_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                logger.error(f"Failed to decode image for {student_name}")
                failed_count += 1
                continue
                
            # Detect and recognize
            bbox, kps = detector.detect(img)
            logger.info(f"Detection bbox: {bbox}")
            embedding = recognizer.get_embedding(img, bbox, kps)
            
            if embedding:
                # Update DB
                supabase.table("students").update({
                    "face_descriptor": json.dumps(embedding)
                }).eq("id", student_id).execute()
                
                logger.info(f"Successfully updated {student_name}")
                updated_count += 1
            else:
                logger.error(f"Could not generate embedding for {student_name}")
                failed_count += 1
                
        except Exception as e:
            logger.error(f"Error processing {student_name}: {e}")
            failed_count += 1

    logger.info(f"Update complete. Updated: {updated_count}, Failed: {failed_count}")

if __name__ == "__main__":
    asyncio.run(update_all_embeddings())
