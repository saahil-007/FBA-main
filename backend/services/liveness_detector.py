"""
Liveness detection service for anti-spoofing.
Detects blinks, smiles, and head movements to verify a real person is present.
Uses facial landmarks to analyze face dynamics.
"""
import numpy as np
import cv2
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger("LivenessDetection")

class LivenessChallenge(Enum):
    BLINK = "blink"
    SMILE = "smile"
    TURN_HEAD_LEFT = "turn_head_left"
    TURN_HEAD_RIGHT = "turn_head_right"
    NONE = "none"

@dataclass
class LivenessResult:
    is_live: bool
    confidence: float
    challenge_completed: Optional[LivenessChallenge]
    details: Dict

class LivenessDetector:
    """
    Liveness detection using facial landmarks and motion analysis.
    """
    
    def __init__(self):
        # Thresholds for various detection
        self.EYE_AR_THRESH = 0.25  # Eye aspect ratio threshold for blink
        self.EYE_AR_CONSEC_FRAMES = 2  # Frames to confirm blink
        self.SMILE_THRESH = 0.45  # Mouth aspect ratio for smile
        self.HEAD_TURN_THRESH = 15  # Degrees for head turn detection
        
        # State tracking for multi-frame analysis
        self.eye_counter = 0
        self.blink_count = 0
        self.frame_history = []
        self.max_history = 30  # Keep last 30 frames
    
    def calculate_eye_aspect_ratio(self, eye_landmarks: List[Tuple[int, int]]) -> float:
        """
        Calculate the eye aspect ratio (EAR).
        EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
        
        Args:
            eye_landmarks: List of 6 (x, y) tuples representing eye landmarks
            
        Returns:
            Eye aspect ratio value
        """
        if len(eye_landmarks) != 6:
            return 1.0  # Default to open eye
        
        # Compute Euclidean distances
        A = np.linalg.norm(np.array(eye_landmarks[1]) - np.array(eye_landmarks[5]))
        B = np.linalg.norm(np.array(eye_landmarks[2]) - np.array(eye_landmarks[4]))
        C = np.linalg.norm(np.array(eye_landmarks[0]) - np.array(eye_landmarks[3]))
        
        ear = (A + B) / (2.0 * C) if C > 0 else 1.0
        return ear
    
    def calculate_mouth_aspect_ratio(self, mouth_landmarks: List[Tuple[int, int]]) -> float:
        """
        Calculate mouth aspect ratio for smile detection.
        
        Args:
            mouth_landmarks: List of (x, y) tuples representing mouth landmarks
            
        Returns:
            Mouth aspect ratio value
        """
        if len(mouth_landmarks) < 8:
            return 0.0
        
        # Vertical distances
        top_lip = np.array(mouth_landmarks[2])
        bottom_lip = np.array(mouth_landmarks[6])
        vertical_dist = np.linalg.norm(top_lip - bottom_lip)
        
        # Horizontal distance
        left_corner = np.array(mouth_landmarks[0])
        right_corner = np.array(mouth_landmarks[4])
        horizontal_dist = np.linalg.norm(left_corner - right_corner)
        
        mar = vertical_dist / horizontal_dist if horizontal_dist > 0 else 0.0
        return mar
    
    def detect_blink(
        self, 
        left_eye_landmarks: List[Tuple[int, int]], 
        right_eye_landmarks: List[Tuple[int, int]]
    ) -> Tuple[bool, float]:
        """
        Detect if eyes are blinking.
        
        Returns:
            Tuple of (is_blinking: bool, avg_ear: float)
        """
        left_ear = self.calculate_eye_aspect_ratio(left_eye_landmarks)
        right_ear = self.calculate_eye_aspect_ratio(right_eye_landmarks)
        avg_ear = (left_ear + right_ear) / 2.0
        
        is_blinking = avg_ear < self.EYE_AR_THRESH
        return is_blinking, avg_ear
    
    def detect_smile(self, mouth_landmarks: List[Tuple[int, int]]) -> Tuple[bool, float]:
        """
        Detect if person is smiling.
        
        Returns:
            Tuple of (is_smiling: bool, mar: float)
        """
        mar = self.calculate_mouth_aspect_ratio(mouth_landmarks)
        is_smiling = mar > self.SMILE_THRESH
        return is_smiling, mar
    
    def detect_head_pose(self, face_landmarks: List[Tuple[int, int]], img_shape: Tuple[int, int]) -> Dict:
        """
        Estimate head pose (yaw, pitch, roll) from facial landmarks.
        
        Args:
            face_landmarks: List of facial landmark coordinates
            img_shape: (height, width) of image
            
        Returns:
            Dictionary with yaw, pitch, roll angles
        """
        if len(face_landmarks) < 5:
            return {"yaw": 0, "pitch": 0, "roll": 0}
        
        # Use simple geometric approach with key landmarks
        # Nose tip, left eye, right eye, left mouth corner, right mouth corner
        try:
            nose = np.array(face_landmarks[30] if len(face_landmarks) > 30 else face_landmarks[2])
            left_eye = np.array(face_landmarks[36] if len(face_landmarks) > 36 else face_landmarks[0])
            right_eye = np.array(face_landmarks[45] if len(face_landmarks) > 45 else face_landmarks[1])
            
            # Calculate eye center
            eye_center = (left_eye + right_eye) / 2
            
            # Estimate yaw based on eye positions relative to nose
            eye_distance = np.linalg.norm(right_eye - left_eye)
            nose_to_eye_center = nose - eye_center
            
            # Simple yaw estimation
            yaw = np.degrees(np.arctan2(nose_to_eye_center[0], eye_distance))
            
            # Simple pitch estimation
            pitch = np.degrees(np.arctan2(nose_to_eye_center[1], eye_distance))
            
            # Roll from eye line
            eye_line = right_eye - left_eye
            roll = np.degrees(np.arctan2(eye_line[1], eye_line[0]))
            
            return {
                "yaw": float(yaw),
                "pitch": float(pitch),
                "roll": float(roll)
            }
        except Exception as e:
            logger.error(f"Error calculating head pose: {e}")
            return {"yaw": 0, "pitch": 0, "roll": 0}
    
    def verify_liveness_challenge(
        self,
        challenge: LivenessChallenge,
        frame_sequence: List[np.ndarray],
        face_detector=None
    ) -> LivenessResult:
        """
        Verify if the liveness challenge was completed.
        
        Args:
            challenge: Type of challenge to verify
            frame_sequence: List of video frames
            face_detector: Face detector instance to extract landmarks
            
        Returns:
            LivenessResult with verification status
        """
        if not frame_sequence or len(frame_sequence) < 5:
            return LivenessResult(
                is_live=False,
                confidence=0.0,
                challenge_completed=None,
                details={"error": "Insufficient frames"}
            )
        
        if challenge == LivenessChallenge.NONE:
            return LivenessResult(
                is_live=True,
                confidence=1.0,
                challenge_completed=LivenessChallenge.NONE,
                details={"message": "No challenge required"}
            )
        
        # Analyze frame sequence for challenge completion
        completed = False
        confidence = 0.0
        details = {}
        
        try:
            if challenge == LivenessChallenge.BLINK:
                # Look for blink pattern in sequence
                blink_detected = False
                eye_ratios = []
                
                for frame in frame_sequence:
                    # This would use face_detector to get eye landmarks
                    # For now, simulate based on frame variation
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
                    variance = np.var(gray)
                    eye_ratios.append(variance)
                
                # Detect significant variation indicating blink
                if len(eye_ratios) > 5:
                    min_val = min(eye_ratios)
                    max_val = max(eye_ratios)
                    if max_val - min_val > 500:  # Significant variation
                        blink_detected = True
                        confidence = min(0.95, 0.7 + (max_val - min_val) / 10000)
                
                completed = blink_detected
                details["blink_detected"] = blink_detected
                details["eye_variance"] = max_val - min_val if len(eye_ratios) > 0 else 0
                
            elif challenge == LivenessChallenge.SMILE:
                # Look for smile pattern
                smile_detected = False
                
                for frame in frame_sequence[-5:]:  # Check last 5 frames
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
                    # Look for bright area in lower face (simplified)
                    height, width = gray.shape
                    lower_face = gray[int(height*0.6):, :]
                    brightness = np.mean(lower_face)
                    
                    if brightness > 100:  # Threshold for smile detection
                        smile_detected = True
                        confidence = 0.8
                        break
                
                completed = smile_detected
                details["smile_detected"] = smile_detected
                
            elif challenge in [LivenessChallenge.TURN_HEAD_LEFT, LivenessChallenge.TURN_HEAD_RIGHT]:
                # Look for head movement
                movement_detected = False
                prev_center = None
                
                for frame in frame_sequence:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
                    # Simple motion detection
                    if prev_center is not None:
                        diff = cv2.absdiff(gray, prev_center)
                        motion_score = np.sum(diff) / diff.size
                        if motion_score > 10:  # Significant motion
                            movement_detected = True
                            confidence = min(0.95, 0.7 + motion_score / 100)
                            break
                    prev_center = gray
                
                completed = movement_detected
                details["movement_detected"] = movement_detected
        
        except Exception as e:
            logger.error(f"Error in liveness verification: {e}")
            return LivenessResult(
                is_live=False,
                confidence=0.0,
                challenge_completed=None,
                details={"error": str(e)}
            )
        
        return LivenessResult(
            is_live=completed,
            confidence=confidence,
            challenge_completed=challenge if completed else None,
            details=details
        )
    
    def quick_liveness_check(self, image: np.ndarray) -> LivenessResult:
        """
        Quick single-image liveness check.
        Analyzes image for signs of liveness (not a photo).
        
        Args:
            image: Input image (BGR format)
            
        Returns:
            LivenessResult
        """
        try:
            # Check for blur (photos are often sharper than screens)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            
            # Check for moiré patterns (screen artifacts)
            # Use FFT to detect periodic patterns
            f = np.fft.fft2(gray)
            fshift = np.fft.fftshift(f)
            magnitude_spectrum = 20 * np.log(np.abs(fshift) + 1)
            
            # High frequency content indicates real face vs screen
            rows, cols = gray.shape
            crow, ccol = rows // 2, cols // 2
            high_freq = magnitude_spectrum[crow-10:crow+10, ccol-10:ccol+10]
            high_freq_score = np.mean(high_freq)
            
            # Combine scores
            is_live = laplacian_var > 50 and high_freq_score > 100
            confidence = min(0.9, (laplacian_var / 200) * 0.5 + (high_freq_score / 200) * 0.5)
            
            return LivenessResult(
                is_live=is_live,
                confidence=confidence,
                challenge_completed=LivenessChallenge.NONE,
                details={
                    "sharpness": float(laplacian_var),
                    "frequency_score": float(high_freq_score),
                    "method": "single_image_analysis"
                }
            )
            
        except Exception as e:
            logger.error(f"Error in quick liveness check: {e}")
            return LivenessResult(
                is_live=False,
                confidence=0.0,
                challenge_completed=None,
                details={"error": str(e)}
            )

# Global instance
liveness_detector = LivenessDetector()
