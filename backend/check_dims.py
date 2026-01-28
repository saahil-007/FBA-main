
import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

def check_descriptors():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(url, key)

    res = supabase.table("students").select("id, name, face_descriptor").execute()
    
    dim_512 = 0
    other_dim = 0
    none_descriptor = 0
    has_descriptor = 0

    for s in res.data:
        desc = s['face_descriptor']
        if desc:
            has_descriptor += 1
            if isinstance(desc, str):
                try:
                    desc_list = json.loads(desc)
                except:
                    desc_list = []
            else:
                desc_list = desc
            
            if len(desc_list) == 512:
                dim_512 += 1
            else:
                other_dim += 1
                print(f"Student {s['name']} has descriptor with dim {len(desc_list)}")
        else:
            none_descriptor += 1

    print("\n--- Summary ---")
    print(f"Total students: {len(res.data)}")
    print(f"With descriptor: {has_descriptor}")
    print(f"512-dim: {dim_512}")
    print(f"Other-dim: {other_dim}")
    print(f"No descriptor: {none_descriptor}")

if __name__ == "__main__":
    check_descriptors()
