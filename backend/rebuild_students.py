"""
Complete Student Database Rebuild Script
This script will:
1. Read the Excel file to get student names and roll numbers
2. Clear the existing students table
3. Create new student records
4. Process all face images and generate descriptors
5. Upload images to Supabase storage
6. Update student records with face descriptors
"""

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
from pathlib import Path

# Add current directory to path to import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    from services.face_detector import FaceDetector
    from services.face_recognizer import FaceRecognizer
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))
    from services.face_detector import FaceDetector
    from services.face_recognizer import FaceRecognizer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("StudentRebuild")

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
HF_REPO = "public-data/insightface"
DET_MODEL_FILE = "models/buffalo_l/det_10g.onnx"
REC_MODEL_FILE = "models/buffalo_l/w600k_r50.onnx"

# Paths
EXCEL_PATH = r"C:\Users\SAHIL\Desktop\Re\FBA\TE Computer A 25-26.xlsx"
FACES_DIR = r"C:\Users\SAHIL\Desktop\Re\FBA\student_faces"
BUCKET_NAME = "student_faces"

# Storage path structure: COMPUTER/TE 2025-26/A/{roll_no}/{roll_no}.jpg
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
        # Load raw to find headers
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
    # Clean columns
    df.columns = [str(c).strip() for c in df.columns]
    
    # Column mapping
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
        raise ValueError("Required columns not found in Excel")
    
    # Drop rows where name is missing
    df = df.dropna(subset=[actual_cols['Name']])
    
    students = []
    for _, row in df.iterrows():
        try:
            roll_no_raw = str(row[actual_cols['Roll No']]).split('.')[0]
            roll_no = roll_no_raw.zfill(2) if roll_no_raw.isdigit() else roll_no_raw
            
            name = str(row[actual_cols['Name']]).strip()
            branch = str(row[actual_cols['Branch']]) if 'Branch' in actual_cols else BRANCH
            year = str(row[actual_cols['Year']]) if 'Year' in actual_cols else YEAR
            division = str(row[actual_cols['Division']]) if 'Division' in actual_cols else DIVISION
            
            if name and roll_no and name.lower() != 'nan':
                students.append({
                    'roll_no': roll_no,
                    'name': name,
                    'branch': branch,
                    'year': year,
                    'division': division
                })
        except Exception as e:
            logger.warning(f"Error parsing row {_}: {e}")
    
    logger.info(f"Parsed {len(students)} students from Excel")
    return students

def clear_students_table(supabase: Client):
    """Clear all existing records from students table"""
    logger.info("Clearing existing students table...")
    try:
        # Get all students first
        result = supabase.table("students").select("id").execute()
        
        if result.data:
            # Delete all students by their IDs
            for student in result.data:
                supabase.table("students").delete().eq("id", student['id']).execute()
        
        logger.info("Successfully cleared students table")
        return True
    except Exception as e:
        logger.error(f"Error clearing students table: {e}")
        logger.info("Continuing with update/insert instead of full clear...")
        return False

def find_matching_image(roll_no: str, faces_dir: str):
    """Find image file matching the roll number"""
    # Try different filename patterns
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

def process_student_image(img_path: str, roll_no: str, detector, recognizer):
    """Process student image to generate face descriptor"""
    try:
        img = cv2.imread(img_path)
        if img is None:
            logger.warning(f"Could not read image: {img_path}")
            return None, None
        
        # Detect faces
        bboxes, kpss = detector.detect(img)
        
        if not bboxes:
            logger.warning(f"No face detected in {img_path}")
            return None, None
        
        # Pick largest face
        idx = 0
        if len(bboxes) > 1:
            areas = [(b[2]-b[0])*(b[3]-b[1]) for b in bboxes]
            idx = areas.index(max(areas))
        
        # Generate embedding
        embeddings = recognizer.get_embeddings(img, [bboxes[idx]], [kpss[idx]] if kpss else None)
        
        if embeddings and len(embeddings) > 0:
            descriptor = embeddings[0]
            # Convert to list for JSON storage
            if isinstance(descriptor, np.ndarray):
                desc_list = descriptor.tolist()
            elif isinstance(descriptor, list):
                desc_list = descriptor
            else:
                desc_list = list(descriptor)
            
            # Also store face shape/keypoints
            # Handle keypoints format - could be numpy array or list
            if kpss:
                if hasattr(kpss[idx], 'tolist'):
                    keypoints_list = kpss[idx].tolist()
                elif isinstance(kpss[idx], list):
                    keypoints_list = kpss[idx]
                else:
                    keypoints_list = list(kpss[idx])
            else:
                keypoints_list = None
                
            face_shape = {
                'bbox': bboxes[idx],
                'keypoints': keypoints_list
            }
            
            return desc_list, face_shape
        else:
            logger.warning(f"Failed to generate embedding for {img_path}")
            return None, None
            
    except Exception as e:
        logger.error(f"Error processing {img_path}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None, None

def upload_to_storage(supabase: Client, img_path: str, roll_no: str):
    """Upload image to Supabase storage"""
    try:
        storage_path = f"{BASE_STORAGE_PATH}/{roll_no}/{roll_no}.jpg"
        
        with open(img_path, 'rb') as f:
            content_type = mimetypes.guess_type(img_path)[0] or "image/jpeg"
            
            # Try to delete existing file first
            try:
                supabase.storage.from_(BUCKET_NAME).remove([storage_path])
            except:
                pass
            
            # Upload new file
            supabase.storage.from_(BUCKET_NAME).upload(
                path=storage_path,
                file=f,
                file_options={"content-type": content_type, "x-upsert": "true"}
            )
        
        logger.info(f"Uploaded image for roll {roll_no} to {storage_path}")
        return storage_path
    except Exception as e:
        logger.error(f"Failed to upload image for roll {roll_no}: {e}")
        return None

def create_student_records(supabase: Client, students_data: list, detector, recognizer):
    """Create student records with face descriptors"""
    stats = {
        'processed': 0,
        'inserted': 0,
        'updated': 0,
        'skipped': 0,
        'errors': 0
    }
    
    for student in students_data:
        roll_no = student['roll_no']
        
        try:
            # Find matching image
            img_path = find_matching_image(roll_no, FACES_DIR)
            
            if not img_path:
                logger.warning(f"No image found for roll {roll_no}")
                stats['skipped'] += 1
                continue
            
            # Process image to get face descriptor
            descriptor, face_shape = process_student_image(img_path, roll_no, detector, recognizer)
            
            if not descriptor:
                logger.warning(f"Could not generate descriptor for roll {roll_no}")
                stats['skipped'] += 1
                continue
            
            # Upload image to storage
            storage_path = upload_to_storage(supabase, img_path, roll_no)
            
            # Prepare student data
            student_data = {
                'roll_no': roll_no,
                'name': student['name'],
                'branch': student['branch'],
                'year': student['year'],
                'division': student['division'],
                'face_descriptor': descriptor
            }
            
            # Check if student already exists
            query = supabase.table("students").select("id").eq("roll_no", roll_no)\
                .eq("branch", student['branch']).eq("year", student['year'])\
                .eq("division", student['division']).execute()
            
            if query.data:
                # Update existing
                student_id = query.data[0]['id']
                supabase.table("students").update(student_data).eq("id", student_id).execute()
                logger.info(f"Updated student: {roll_no} - {student['name']}")
                stats['updated'] += 1
            else:
                # Insert new
                supabase.table("students").insert(student_data).execute()
                logger.info(f"Inserted student: {roll_no} - {student['name']}")
                stats['inserted'] += 1
            
            stats['processed'] += 1
            
        except Exception as e:
            logger.error(f"Error processing student {roll_no}: {e}")
            stats['errors'] += 1
    
    return stats

def main():
    """Main execution function"""
    logger.info("="*60)
    logger.info("STUDENT DATABASE REBUILD SCRIPT")
    logger.info("="*60)
    
    # Validate configuration
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase credentials not found! Check .env file.")
        return
    
    # Initialize Supabase client
    logger.info("Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Initialize models
    detector, recognizer = initialize_models()
    
    # Read Excel data
    df = read_excel_data()
    students_data = parse_excel_data(df)
    
    if not students_data:
        logger.error("No students found in Excel file!")
        return
    
    # Clear existing data
    logger.info("\nStep 1: Clearing existing data...")
    clear_students_table(supabase)
    
    # Create new records
    logger.info("\nStep 2: Creating new student records with face descriptors...")
    stats = create_student_records(supabase, students_data, detector, recognizer)
    
    # Print summary
    logger.info("\n" + "="*60)
    logger.info("REBUILD COMPLETE - SUMMARY")
    logger.info("="*60)
    logger.info(f"Total students in Excel: {len(students_data)}")
    logger.info(f"Successfully processed: {stats['processed']}")
    logger.info(f"Inserted: {stats['inserted']}")
    logger.info(f"Updated: {stats['updated']}")
    logger.info(f"Skipped (no image/descriptor): {stats['skipped']}")
    logger.info(f"Errors: {stats['errors']}")
    logger.info("="*60)

if __name__ == "__main__":
    main()
