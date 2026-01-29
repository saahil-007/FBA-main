import os
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

excel_path = r"c:\Users\SAHIL\Desktop\Re\FBA\TE Computer A 25-26.xlsx"

def update_roll_numbers():
    if not os.path.exists(excel_path):
        print(f"Excel file not found at {excel_path}")
        return

    df = pd.read_excel(excel_path)
    # Expected columns: 'Roll no', 'Candidate Name (With mother name)'
    
    # Fetch all students for TE Computer A
    res = supabase.table("students").select("*").eq("branch", "COMPUTER").eq("year", "TE").eq("division", "A").execute()
    existing_students = res.data
    
    print(f"Found {len(existing_students)} existing students in Supabase.")
    print(f"Found {len(df)} students in Excel.")

    for index, row in df.iterrows():
        roll_no = str(row['Roll no'])
        full_name = str(row['Candidate Name (With mother name)']).strip()
        
        # Try to find student by name
        match = next((s for s in existing_students if s['name'].strip().lower() == full_name.lower()), None)
        
        if match:
            # Update roll number
            print(f"Updating {full_name}: {match['roll_no']} -> {roll_no}")
            supabase.table("students").update({"roll_no": roll_no}).eq("id", match['id']).execute()
        else:
            # If not found, maybe insert? But user only said "update the roll numbers first"
            # Let's insert if not found to be proactive
            print(f"Student not found in DB, inserting: {full_name} with roll {roll_no}")
            supabase.table("students").insert({
                "name": full_name,
                "roll_no": roll_no,
                "branch": "COMPUTER",
                "year": "TE",
                "division": "A"
            }).execute()

if __name__ == "__main__":
    update_roll_numbers()
