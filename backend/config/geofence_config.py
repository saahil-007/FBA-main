"""
Configuration file for geofencing and location settings.
This allows easy switching between teacher location mode and classroom location mode.
"""

class GeofenceConfig:
    """
    Configuration for geofencing functionality.
    
    This can be set via environment variables or changed programmatically.
    """
    
    # Feature flag: Use teacher location instead of classroom location
    # Set to True for temporary solution (until classroom coordinates are configured)
    # Set to False to use classroom coordinates from database
    USE_TEACHER_LOCATION = True
    
    # Default radius in meters
    DEFAULT_RADIUS_METERS = 15
    
    # Minimum radius allowed (security)
    MIN_RADIUS_METERS = 5
    
    # Maximum radius allowed (practical limit)
    MAX_RADIUS_METERS = 100
    
    # Error message when student is outside geofence
    GEOFENCE_ERROR_MESSAGE = "You are not in the classroom. Please be within {radius}m of the session location."
    
    @classmethod
    def get_radius(cls, custom_radius: int = None) -> int:
        """Get geofence radius with validation."""
        radius = custom_radius or cls.DEFAULT_RADIUS_METERS
        return max(cls.MIN_RADIUS_METERS, min(cls.MAX_RADIUS_METERS, radius))
    
    @classmethod
    def is_teacher_location_mode(cls) -> bool:
        """Check if using teacher location mode."""
        return cls.USE_TEACHER_LOCATION
    
    @classmethod
    def set_teacher_location_mode(cls, enabled: bool):
        """Enable or disable teacher location mode."""
        cls.USE_TEACHER_LOCATION = enabled

# Import from environment if available
try:
    import os
    if os.environ.get('USE_TEACHER_LOCATION', '').lower() in ('false', '0', 'no'):
        GeofenceConfig.USE_TEACHER_LOCATION = False
    if os.environ.get('GEOFENCE_RADIUS'):
        GeofenceConfig.DEFAULT_RADIUS_METERS = int(os.environ.get('GEOFENCE_RADIUS'))
except:
    pass
