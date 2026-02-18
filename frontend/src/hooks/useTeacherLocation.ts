import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { API_URL } from '../config';

interface Location {
  lat: number;
  lon: number;
}

interface UseTeacherLocationProps {
  sessionId: string;
  enabled: boolean;
  updateInterval?: number; // milliseconds
}

export const useTeacherLocation = ({ 
  sessionId, 
  enabled, 
  updateInterval = 3000 
}: UseTeacherLocationProps) => {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateTeacherLocation = async (newLocation: Location) => {
    if (!enabled || isUpdating) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`${API_URL}/update-teacher-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          teacher_lat: newLocation.lat,
          teacher_lon: newLocation.lon
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update teacher location');
      }

      setLocation(newLocation);
      setError(null);
    } catch (err) {
      console.error('Failed to update teacher location:', err);
      setError('Failed to update location');
    } finally {
      setIsUpdating(false);
    }
  };

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }

    // Use watchPosition for real-time updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          // Use 5 decimal places for high accuracy as requested
          lat: Number(position.coords.latitude.toFixed(5)),
          lon: Number(position.coords.longitude.toFixed(5))
        };
        
        setLocation(newLocation);
        
        // Update Supabase every updateInterval milliseconds
        if (updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
        }
        
        updateTimerRef.current = setTimeout(() => {
          updateTeacherLocation(newLocation);
        }, updateInterval);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Unable to get location updates');
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
      }
    );
  };

  const stopLocationTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (enabled) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }

    return () => {
      stopLocationTracking();
    };
  }, [enabled, sessionId]);

  return {
    location,
    error,
    isUpdating,
    startLocationTracking,
    stopLocationTracking
  };
};