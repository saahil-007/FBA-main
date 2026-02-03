"""
Script to add missing students to the database
Only processes students not already present in Computer/TE/A
"""

import os
import pandas as pd
import cv2
import numpy as np
import logging
from supabase import create_client, Client
from dotenv import load_dotenv
from huggingface_hub import hf_hub_download
import sys
import mimetypes

# Add current directory to path to import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from services.face_detector import FaceDetector
from services.face_recognizer import FaceRecognizer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("AddMissingStudents")

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
HF_REPO = "public-data/insightface"
DET_MODEL_FILE = "models/buffalo_l/det_10g.onnx"
REC_MODEL_FILE = "models/buffalo_l/w600k_r50.onnx"

EXCEL_PATH = r"C:\Users\SAHIL\Desktop\Re\FBA\TE Computer A 25-26.xlsx"
FACES_DIR = r"C:\Users\SAHIL\Desktop\Re\FBA\student_faces"
BUCKET_NAME = "student_faces"
BASE_STORAGE_PATH = "COMPUTER/TE 2025-26/A"
BRANCH = "Computer"
YEAR = "TE"
DIVISION = "A"

def initialize_models():
    """Download and initialize face detection and recognition models"""
    logger.info("Downloading models from HuggingFace...")
    det_path = hf_hub_download(repo_id=HF_REPO, filename=DET_MODEL_FILE)
    rec_path = hf_hub_download(repo_id=HF_REPO, filename=REC_MODEL_FILE)
    
    logger.info("Initializing face detection and recognition models...")
    detector = FaceDetector(det_path)
    recognizer = FaceRecognizer(rec_path)
    return detector, recognizer

def read_excel_data():
    """Read student data from Excel file"""
    logger.info(f"Reading Excel file: {EXCEL_PATH}")
    
    try:
        df_raw = pd.read_excel(EXCEL_PATH, header=None)
        header_idx = 0
        for i, row in df_raw.iterrows():
            row_str = " ".join([str(x) for x in row.values if pd.notna(x)])
            if any(h in row_str for h in ['Roll', 'Name', 'Candidate']):
                header_idx = i
                break
        
        df = pd.read_excel(EXCEL_PATH, header=header_idx)
        logger.info(f"Found {len(df)} rows in Excel file")
        return df
    except Exception as e:
        logger.error(f"Failed to read Excel: {e}")
        raise

def parse_excel_data(df):
    """Parse Excel data to extract roll numbers and names"""
    df.columns = [str(c).strip() for c in df.columns]
    
    col_map = {
        'Roll No': ['Roll no', 'Roll No', 'RollNo', 'Roll', 'roll_no', 'SR. NO.', 'Sr. No.'],
        'Name': ['Candidate Name (With mother name)', 'Name', 'Student Name', 'name', 'NAME OF STUDENT'],
    }
    
    actual_cols = {}
    for target, alternates in col_map.items():
        for alt in alternates:
            if alt in df.columns:
                actual_cols[target] = alt
                break
    
    if 'Name' not in actual_cols or 'Roll No' not in actual_cols:
        logger.error(f"Could not find Name or Roll No columns. Found: {df.columns.tolist()}")
        raise ValueError("Required columns not found in Excel")
    
    df = df.dropna(subset=[actual_cols['Name']])
    
    students = []
    for _, row in df.iterrows():
        try:
            roll_no_raw = str(row[actual_cols['Roll No']]).split('.')[0]
            roll_no = roll_no_raw.zfill(2) if roll_no_raw.isdigit() else roll_no_raw
            
            name = str(row[actual_cols['Name']]).strip()
            
            if name and roll_no and name.lower() != 'nan':
                students.append({
                    'roll_no': roll_no,
                    'name': name,
                    'branch': BRANCH,
                    'year': YEAR,
                    'division': DIVISION
                })
        except Exception as e:
            logger.warning(f"Error parsing row {_}: {e}")
    
    logger.info(f"Parsed {len(students)} students from Excel")
    return students

def find_matching_image(roll_no: str, faces_dir: str):
    """Find image file matching the roll number"""
    patterns = [
        f"{roll_no}.jpg",
        f"{roll_no}.jpeg",
        f"{roll_no}.png",
        f"{int(roll_no)}.jpg",
        f"{int(roll_no)}.jpeg",
        f"{int(roll_no)}.png",
    ]
    
    for pattern in patterns:
        img_path = os.path.join(faces_dir, pattern)
        if os.path.exists(img_path):
            return img_path
    
    return None

def process_student_image(img_path: str, detector, recognizer):
    """Process student image to generate face descriptor"""
    try:
        img = cv2.imread(img_path)
        if img is None:
            return None
        
        bboxes, kpss = detector.detect(img)
        
        if not bboxes:
            return None
        
        idx = 0
        if len(bboxes) > 1:
            areas = [(b[2]-b[0])*(b[3]-b[1]) for b in bboxes]
            idx = areas.index(max(areas))
        
        embeddings = recognizer.get_embeddings(img, [bboxes[idx]], [kpss[idx]] if kpss else None)
        
        if embeddings and len(embeddings) > 0:
            descriptor = embeddings[0]
            if isinstance(descriptor, np.ndarray):
                return descriptor.tolist()
            elif isinstance(descriptor, list):
                return descriptor
            else:
                return list(descriptor)
        
        return None
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return None

def upload_to_storage(supabase: Client, img_path: str, roll_no: str):
    """Upload image to Supabase storage"""
    try:
        storage_path = f"{BASE_STORAGE_PATH}/{roll_no}/{roll_no}.jpg"
        
        with open(img_path, 'rb') as f:
            content_type = mimetypes.guess_type(img_path)[0] or "image/jpeg"
            
            try:
                supabase.storage.from_(BUCKET_NAME).remove([storage_path])
            except:
                pass
            
            supabase.storage.from_(BUCKET_NAME).upload(
                path=storage_path,
                file=f,
                file_options={"content-type": content_type, "x-upsert": "true"}
            )
        
        logger.info(f"Uploaded image for roll {roll_no}")
        return storage_path
    except Exception as e:
        logger.error(f"Failed to upload image for roll {roll_no}: {e}")
        return None

def add_missing_students(supabase: Client, students_data: list, detector, recognizer):
    """Add only missing students to database"""
    stats = {'processed': 0, 'inserted': 0, 'skipped': 0, 'errors': 0}
    
    for student in students_data:
        roll_no = student['roll_no']
        
        try:
            # Check if student already exists
            query = supabase.table("students").select("id").eq("roll_no", roll_no)\
                .eq("branch", student['branch']).eq("year", student['year'])\
                .eq("division", student['division']).execute()
            
            if query.data:
                logger.info(f"Student {roll_no} already exists, skipping")
                continue
            
            # Find matching image
            img_path = find_matching_image(roll_no, FACES_DIR)
            
            if not img_path:
                logger.warning(f"No image found for roll {roll_no}")
                stats['skipped'] += 1
                continue
            
            # Process image
            descriptor = process_student_image(img_path, detector, recognizer)
            
            if not descriptor:
                logger.warning(f"Could not generate descriptor for roll {roll_no}")
                stats['skipped'] += 1
                continue
            
            # Upload image
            storage_path = upload_to_storage(supabase, img_path, roll_no)
            
            # Insert student
            student_data = {
                'roll_no': roll_no,
                'name': student['name'],
                'branch': student['branch'],
                'year': student['year'],
                'division': student['division'],
                'face_descriptor': descriptor
            }
            
            supabase.table("students").insert(student_data).execute()
            logger.info(f"Inserted student: {roll_no} - {student['name']}")
            stats['inserted'] += 1
            stats['processed'] += 1
            
        except Exception as e:
            logger.error(f"Error processing student {roll_no}: {e}")
            stats['errors'] += 1
    
    return stats

def main():
    logger.info("="*60)
    logger.info("ADDING MISSING STUDENTS - COMPUTER/TE/A")
    logger.info("="*60)
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials not found!")
        return
    
    logger.info("Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Get existing students
    result = supabase.table('students').select('roll_no').eq('branch', 'Computer')\
        .eq('year', 'TE').eq('division', 'A').execute()
    existing_rolls = {s['roll_no'] for s in result.data}
    logger.info(f"Found {len(existing_rolls)} existing students")
    
    # Read Excel
    df = read_excel_data()
    all_students = parse_excel_data(df)
    
    # Filter to only missing students
    missing_students = [s for s in all_students if s['roll_no'] not in existing_rolls]
    logger.info(f"Found {len(missing_students)} missing students to add")
    
    if not missing_students:
        logger.info("No missing students to add!")
        return
    
    # Initialize models
    detector, recognizer = initialize_models()
    
    # Add missing students
    logger.info("\nAdding missing students...")
    stats = add_missing_students(supabase, missing_students, detector, recognizer)
    
    # Print summary
    logger.info("\n" + "="*60)
    logger.info("COMPLETION SUMMARY")
    logger.info("="*60)
    logger.info(f"Missing students found: {len(missing_students)}")
    logger.info(f"Successfully processed: {stats['processed']}")
    logger.info(f"Inserted: {stats['inserted']}")
    logger.info(f"Skipped: {stats['skipped']}")
    logger.info(f"Errors: {stats['errors']}")
    logger.info("="*60)

if __name__ == "__main__":
    main()
