import json
import logging
from typing import Dict
from supabase import Client

logger = logging.getLogger("FBA-Backend.Embeddings")

class EmbeddingManager:
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
        self.cache: Dict[str, Dict[str, Dict]] = {}

    async def load_session_embeddings(self, session_id: str, recognizer=None, detector=None):
        """
        Fast loading of embeddings for a session.
        Only loads pre-computed descriptors from the database.
        """
        logger.info(f"Instantly loading embeddings for session: {session_id}")
        try:
            # 1. Fetch session details to know which class/students to load
            session_resp = self.supabase.table("sessions").select("*").eq("id", session_id).single().execute()
            if not session_resp.data:
                logger.error(f"Session {session_id} not found in database.")
                return None
            
            session = session_resp.data
            branch, year, division = session["branch"], session["year"], session["division"]

            # 2. Fetch all students in that class with their pre-computed descriptors
            students_resp = self.supabase.table("students").select("id, name, roll_no, face_descriptor")\
                .eq("branch", branch)\
                .eq("year", year)\
                .eq("division", division)\
                .execute()
            students = students_resp.data

            embeddings = {}
            for student in students:
                student_id = student["id"]
                if student["face_descriptor"]:
                    try:
                        # Load the descriptor directly from JSON
                        desc = json.loads(student["face_descriptor"])
                        embeddings[student_id] = {
                            "name": student["name"], 
                            "roll_no": student.get("roll_no", "N/A"),
                            "embedding": desc
                        }
                    except Exception as e:
                        logger.warning(f"Malformed descriptor for student {student_id}: {e}")
            
            # 3. Store in local session-exclusive cache
            self.cache[session_id] = embeddings
            logger.info(f"Successfully loaded {len(embeddings)} face descriptors for session {session_id}")
            return embeddings
        except Exception as e:
            logger.exception(f"Instant load failed for session {session_id}: {e}")
            return None

    def get_session_embeddings(self, session_id: str):
        return self.cache.get(session_id)

    def clear_cache(self, session_id: str = None):
        if session_id:
            self.cache.pop(session_id, None)
        else:
            self.cache.clear()
