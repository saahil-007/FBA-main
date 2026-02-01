import os
import pandas as pd
import cv2
import numpy as np
import json
import logging
from supabase import create_client, Client
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
import sys
import mimetypes

# Add current directory to path to import services
sys.path.append(os.getcwd())
try:
    from services.face_detector import FaceDetector
    from services.face_recognizer import FaceRecognizer
except ImportError:
    # Fallback if running from a different directory
    sys.path.append(os.path.join(os.getcwd(), 'backend'))
    from services.face_detector import FaceDetector
    from services.face_recognizer import FaceRecognizer

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SyncToolV2")

load_dotenv()

# Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
HF_REPO = "public-data/insightface"
DET_MODEL_FILE = "models/buffalo_l/det_10g.onnx"
REC_MODEL_FILE = "models/buffalo_l/w600k_r50.onnx"

EXCEL_PATH = r"c:\Users\SAHIL\Desktop\Re\FBA\TE Computer A 25-26.xlsx"
FACES_DIR = r"c:\Users\SAHIL\Desktop\Re\FBA\student_faces"
BUCKET_NAME = "student_faces"

# User specified path: COMPUTER > TE 2025-26 > A > {ROLL_NO} > {ROLL_NO.JPG}
BASE_STORAGE_PATH = "COMPUTER/TE 2025-26/A"

def initialize_models():
    logger.info("Downloading models...")
    det_path = hf_hub_download(repo_id=HF_REPO, filename=DET_MODEL_FILE)
    rec_path = hf_hub_download(repo_id=HF_REPO, filename=REC_MODEL_FILE)
    
    logger.info("Initializing models...")
    detector = FaceDetector(det_path)
    recognizer = FaceRecognizer(rec_path)
    return detector, recognizer

def deduplicate_students(supabase: Client, branch="Computer", year="TE", division="A"):
    """
    Finds and removes duplicate student records based on roll_no within a class.
    """
    logger.info(f"Checking for duplicates in {branch} {year} {division}...")
    try:
        # Get all students for this class
        res = supabase.table("students").select("id, roll_no").eq("branch", branch).eq("year", year).eq("division", division).execute()
        students = res.data
        
        if not students:
            return 0
            
        # Group by roll_no
        roll_map = {}
        for s in students:
            r = s['roll_no']
            if r not in roll_map:
                roll_map[r] = []
            roll_map[r].append(s['id'])
            
        duplicates_removed = 0
        for r, ids in roll_map.items():
            if len(ids) > 1:
                logger.info(f"Found {len(ids)} records for Roll {r}. Keeping {ids[0]}, removing others.")
                # Keep the first one, delete the rest
                for extra_id in ids[1:]:
                    supabase.table("students").delete().eq("id", extra_id).execute()
                    duplicates_removed += 1
        
        if duplicates_removed > 0:
            logger.info(f"Removed {duplicates_removed} duplicate records.")
        return duplicates_removed
    except Exception as e:
        logger.error(f"Error during deduplication: {e}")
        return 0

def sync_students_from_excel(supabase: Client):
    logger.info(f"Reading Excel from {EXCEL_PATH}...")
    try:
        # Load raw to find headers
        df_raw = pd.read_excel(EXCEL_PATH, header=None)
        header_idx = 0
        for i, row in df_raw.iterrows():
            row_str = " ".join([str(x) for x in row.values if pd.notna(x)])
            if any(h in row_str for h in ['Roll', 'Name', 'Candidate']):
                header_idx = i
                break
        
        df = pd.read_excel(EXCEL_PATH, header=header_idx)
    except Exception as e:
        logger.error(f"Failed to read Excel: {e}")
        return {}

    # Clean columns
    df.columns = [str(c).strip() for c in df.columns]
    
    # Mapping
    col_map = {
        'Roll No': ['Roll no', 'Roll No', 'RollNo', 'Roll', 'roll_no', 'SR. NO.', 'Sr. No.'],
        'Name': ['Candidate Name (With mother name)', 'Name', 'Student Name', 'name', 'NAME OF STUDENT'],
        'Branch': ['Branch', 'branch'],
        'Year': ['Year', 'year'],
        'Division': ['Division', 'division', 'Div']
    }
    
    actual_cols = {}
    for target, alternates in col_map.items():
        for alt in alternates:
            if alt in df.columns:
                actual_cols[target] = alt
                break
    
    if 'Name' not in actual_cols or 'Roll No' not in actual_cols:
        logger.error(f"Could not find Name or Roll No columns. Found: {df.columns.tolist()}")
        return {}

    # Drop rows where name is missing
    df = df.dropna(subset=[actual_cols['Name']])
    
    stats = {"added": 0, "updated": 0, "errors": 0}
    
    for _, row in df.iterrows():
        try:
            roll_no_raw = str(row[actual_cols['Roll No']]).split('.')[0] # Handle float-like strings
            roll_no = roll_no_raw.zfill(2) if roll_no_raw.isdigit() else roll_no_raw
            
            name = str(row[actual_cols['Name']])
            branch = str(row[actual_cols['Branch']]) if 'Branch' in actual_cols else "Computer"
            year = str(row[actual_cols['Year']]) if 'Year' in actual_cols else "TE"
            division = str(row[actual_cols['Division']]) if 'Division' in actual_cols else "A"

            student_data = {
                "roll_no": roll_no,
                "name": name,
                "branch": branch,
                "year": year,
                "division": division
            }

            # Check if exists
            query = supabase.table("students").select("id").eq("roll_no", roll_no).eq("branch", branch).eq("year", year).eq("division", division).execute()
            
            if query.data:
                student_id = query.data[0]["id"]
                supabase.table("students").update({"name": name}).eq("id", student_id).execute()
                stats["updated"] += 1
            else:
                supabase.table("students").insert(student_data).execute()
                stats["added"] += 1
                
        except Exception as e:
            logger.error(f"Error syncing student at row {_}: {e}")
            stats["errors"] += 1
            
    logger.info(f"Excel sync complete: {stats}")
    return stats

def update_descriptors_and_photos(supabase: Client, detector, recognizer):
    logger.info(f"Scanning photos in {FACES_DIR}...")
    if not os.path.exists(FACES_DIR):
        logger.error(f"Faces directory {FACES_DIR} does not exist!")
        return
        
    files = [f for f in os.listdir(FACES_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    stats = {"processed": 0, "uploaded": 0, "skipped": 0, "errors": 0}
    
    processed_roll_nos = set()
    
    for filename in sorted(files):
        try:
            # Extract roll number
            roll_no_raw = os.path.splitext(filename)[0].split('_')[0].split(' ')[0]
            roll_no = roll_no_raw.zfill(2) if roll_no_raw.isdigit() else roll_no_raw
            
            if roll_no in processed_roll_nos:
                continue
            
            # Find student in DB (standardized for this specific class)
            query = supabase.table("students").select("id").eq("roll_no", roll_no).eq("branch", "Computer").eq("year", "TE").eq("division", "A").execute()
            
            if not query.data:
                logger.warning(f"Student {roll_no} not found in DB. Skip.")
                stats["skipped"] += 1
                continue
                
            student_id = query.data[0]["id"]
            img_path = os.path.join(FACES_DIR, filename)
            
            # 1. Upload to Storage
            # Path: COMPUTER/TE 2025-26/A/{roll_no}/{roll_no}.jpg
            storage_path = f"{BASE_STORAGE_PATH}/{roll_no}/{roll_no}.jpg"
            
            with open(img_path, 'rb') as f:
                content_type = mimetypes.guess_type(img_path)[0] or "image/jpeg"
                supabase.storage.from_(BUCKET_NAME).upload(
                    path=storage_path,
                    file=f,
                    file_options={"content-type": content_type, "x-upsert": "true"}
                )
                stats["uploaded"] += 1
                logger.info(f"Uploaded {roll_no}.jpg to {storage_path}")

            # 2. Generate Descriptor
            img = cv2.imread(img_path)
            if img is None:
                stats["errors"] += 1
                continue
                
            bboxes, kpss = detector.detect(img)
            if not bboxes:
                logger.warning(f"No face in {filename}")
                stats["skipped"] += 1
                continue
                
            # Pick largest face
            idx = 0
            if len(bboxes) > 1:
                areas = [(b[2]-b[0])*(b[3]-b[1]) for b in bboxes]
                idx = areas.index(max(areas))
                
            embeddings = recognizer.get_embeddings(img, [bboxes[idx]], [kpss[idx]])
            if embeddings:
                descriptor = embeddings[0]
                # Save as list for JSON compatibility
                desc_list = descriptor.tolist() if isinstance(descriptor, np.ndarray) else descriptor
                supabase.table("students").update({"face_descriptor": desc_list}).eq("id", student_id).execute()
                stats["processed"] += 1
                logger.info(f"Updated descriptor for {roll_no}")
            else:
                stats["errors"] += 1
                
            processed_roll_nos.add(roll_no)
            
        except Exception as e:
            logger.error(f"Error processing {filename}: {e}")
            stats["errors"] += 1
            
    logger.info(f"Photo/Descriptor sync complete: {stats}")
    return stats

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials missing!")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 1. Deduplicate existing records
    deduplicate_students(supabase)
    
    # 2. Sync from Excel
    sync_students_from_excel(supabase)
    
    # 3. Initialize models for face processing
    detector, recognizer = initialize_models()
    
    # 4. Upload photos and update descriptors
    update_descriptors_and_photos(supabase, detector, recognizer)
    
    logger.info("All tasks completed successfully with V2 script.")

if __name__ == "__main__":
    main()
