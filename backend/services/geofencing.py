"""
Geofencing service for classroom location validation.
Uses Haversine formula to calculate distance between two GPS coordinates.
"""
import math
from typing import Tuple, Optional

class GeofencingService:
    """
    Service for validating if a student is within the classroom geofence.
    Default radius is 10 meters.
    """
    
    def __init__(self, default_radius_meters: float = 10.0):
        self.default_radius = default_radius_meters
        # Earth's radius in meters
        self.EARTH_RADIUS_METERS = 6371000
    
    def calculate_distance(
        self, 
        lat1: float, 
        lon1: float, 
        lat2: float, 
        lon2: float
    ) -> float:
        """
        Calculate the great circle distance between two points on Earth.
        Uses the Haversine formula with 5 decimal place precision as requested.
        
        Args:
            lat1, lon1: First point coordinates (classroom)
            lat2, lon2: Second point coordinates (student)
            
        Returns:
            Distance in meters
        """
        # Enforce 5 decimal place precision as requested for robust accuracy
        lat1 = round(lat1, 5)
        lon1 = round(lon1, 5)
        lat2 = round(lat2, 5)
        lon2 = round(lon2, 5)
        
        # Convert latitude and longitude from degrees to radians
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        # Haversine formula
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        distance = self.EARTH_RADIUS_METERS * c
        return distance
    
    def is_within_geofence(
        self, 
        classroom_lat: float, 
        classroom_lon: float,
        student_lat: float, 
        student_lon: float,
        radius_meters: Optional[float] = None
    ) -> Tuple[bool, float]:
        """
        Check if student is within the classroom geofence.
        
        Args:
            classroom_lat, classroom_lon: Classroom coordinates
            student_lat, student_lon: Student coordinates
            radius_meters: Geofence radius (defaults to 10m)
            
        Returns:
            Tuple of (is_within_geofence: bool, distance_meters: float)
        """
        radius = radius_meters if radius_meters is not None else self.default_radius
        
        distance = self.calculate_distance(
            classroom_lat, classroom_lon,
            student_lat, student_lon
        )
        
        is_within = distance <= radius
        return is_within, distance
    
    def validate_location(
        self,
        classroom_lat: Optional[float],
        classroom_lon: Optional[float],
        student_lat: float,
        student_lon: float,
        radius_meters: Optional[float] = None
    ) -> dict:
        """
        Validate student location against classroom geofence.
        Returns detailed validation result.
        """
        # Add logging for debugging
        import logging
        logger = logging.getLogger(__name__)

        if classroom_lat is None or classroom_lon is None:
            return {
                "valid": False,
                "error": "Classroom location not configured",
                "distance_meters": None,
                "is_within_geofence": False
            }
        
        # Use provided radius or default
        radius = radius_meters if radius_meters is not None else self.default_radius
        
        # ROBUSTNESS FIX: Enforce a minimum radius of 25 meters.
        # Indoor GPS accuracy is often poor (10-20m error is common).
        # If the teacher/default set a very small radius (e.g. 10m), we override it 
        # to prevent valid students from being blocked due to minor GPS drift.
        effective_radius = max(radius, 25.0)
        
        distance = self.calculate_distance(
            classroom_lat, classroom_lon,
            student_lat, student_lon
        )
        
        is_within = distance <= effective_radius
        
        logger.info(f"Geofence check: Dist={distance:.2f}m, Radius={effective_radius}m (Original={radius}), Valid={is_within}")
        
        return {
            "valid": is_within,
            "distance_meters": round(distance, 2),
            "is_within_geofence": is_within,
            "classroom_radius": effective_radius,
            "classroom_location": {"lat": classroom_lat, "lon": classroom_lon},
            "student_location": {"lat": student_lat, "lon": student_lon}
        }

# Global instance
geofencing_service = GeofencingService()
