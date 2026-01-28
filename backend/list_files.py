import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

try:
    # List files in student_faces bucket
    res = supabase.storage.from_("student_faces").list("COMPUTER/TE 2025-26/A")
    print("Files in COMPUTER/TE 2025-26/A:")
    for f in res:
        print(f"'{f['name']}'")
except Exception as e:
    print(f"Error: {e}")
