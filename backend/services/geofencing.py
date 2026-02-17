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
        Uses the Haversine formula.
        
        Args:
            lat1, lon1: First point coordinates (classroom)
            lat2, lon2: Second point coordinates (student)
            
        Returns:
            Distance in meters
        """
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
        if classroom_lat is None or classroom_lon is None:
            return {
                "valid": False,
                "error": "Classroom location not configured",
                "distance_meters": None,
                "is_within_geofence": False
            }
        
        radius = radius_meters if radius_meters is not None else self.default_radius
        
        is_within, distance = self.is_within_geofence(
            classroom_lat, classroom_lon,
            student_lat, student_lon,
            radius
        )
        
        return {
            "valid": is_within,
            "distance_meters": round(distance, 2),
            "is_within_geofence": is_within,
            "classroom_radius": radius,
            "classroom_location": {"lat": classroom_lat, "lon": classroom_lon},
            "student_location": {"lat": student_lat, "lon": student_lon}
        }

# Global instance
geofencing_service = GeofencingService()
