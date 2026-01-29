import os
import glob
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

faces_dir = r"c:\Users\SAHIL\Desktop\Re\FBA\student_faces"
bucket_name = "student_faces"

def upload_photos():
    # 1. Fetch students to map roll numbers
    res = supabase.table("students").select("*").eq("branch", "COMPUTER").eq("year", "TE").eq("division", "A").execute()
    students = res.data
    
    if not students:
        print("No students found in Supabase.")
        return

    # Map roll_no (str) to student record
    roll_to_student = {s['roll_no']: s for s in students}

    # 2. Get all local photos
    photo_paths = glob.glob(os.path.join(faces_dir, "*.jpg"))
    print(f"Found {len(photo_paths)} local photos.")

    for photo_path in photo_paths:
        filename = os.path.basename(photo_path) # e.g. "01.jpg"
        roll_part = filename.split('.')[0] # "01"
        
        # Convert "01" to "1" to match our updated roll numbers in DB
        try:
            roll_no = str(int(roll_part))
        except ValueError:
            print(f"Skipping invalid filename: {filename}")
            continue

        if roll_no in roll_to_student:
            student = roll_to_student[roll_no]
            # Format: branch/year 2025-26/division/roll_no/roll_no.jpg
            # Note: The year in path seems to be "TE 2025-26" based on previous checks
            storage_path = f"COMPUTER/TE 2025-26/A/{roll_no}/{roll_no}.jpg"
            
            print(f"Uploading {filename} to {storage_path} for {student['name']}...")
            
            with open(photo_path, 'rb') as f:
                try:
                    # Upload with upsert=True to overwrite if exists
                    supabase.storage.from_(bucket_name).upload(
                        path=storage_path,
                        file=f,
                        file_options={"content-type": "image/jpeg", "upsert": "true"}
                    )
                except Exception as e:
                    # If upload fails, try update if it's already there
                    try:
                        supabase.storage.from_(bucket_name).update(
                            path=storage_path,
                            file=f,
                            file_options={"content-type": "image/jpeg", "upsert": "true"}
                        )
                    except Exception as e2:
                        print(f"Failed to upload {filename}: {e2}")
        else:
            print(f"No student found in DB for roll number {roll_no} (from {filename})")

if __name__ == "__main__":
    upload_photos()
