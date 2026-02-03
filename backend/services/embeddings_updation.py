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
            logger.info(f"Session {session_id} details: Branch={branch}, Year={year}, Div={division}")

            # 2. Fetch all students in that class with their pre-computed descriptors
            # Use case-insensitive matching for robustness (COMPUTER vs Computer)
            students_resp = self.supabase.table("students").select("id, name, roll_no, face_descriptor")\
                .ilike("branch", branch)\
                .ilike("year", year)\
                .ilike("division", division)\
                .execute()
            students = students_resp.data
            
            if not students:
                logger.warning(f"No students found for {branch} {year} {division}")
                self.cache[session_id] = {}
                return {}

            logger.info(f"Found {len(students)} students in class. Processing descriptors...")
            embeddings = {}
            for student in students:
                student_id = student["id"]
                if student.get("face_descriptor"):
                    try:
                        # Handle both string (JSON) and list (already parsed) formats
                        desc = student["face_descriptor"]
                        if isinstance(desc, str):
                            desc = json.loads(desc)
                        
                        embeddings[student_id] = {
                            "name": student["name"], 
                            "roll_no": student.get("roll_no", "N/A"),
                            "embedding": desc
                        }
                    except Exception as e:
                        logger.warning(f"Malformed descriptor for student {student_id}: {e}")
                else:
                    logger.debug(f"Student {student_id} ({student['name']}) has no face_descriptor.")
            
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
