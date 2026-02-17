import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, X, AlertCircle, MapPin, User, Shield, CheckCircle2 } from "lucide-react";
import { API_URL } from "@/config";

// Environment detection - use localStorage on localhost, Supabase on production
const isProduction = () => {
  const hostname = window.location.hostname;
  return hostname === 'fba-dmce.vercel.app' || hostname.includes('vercel.app');
};

const StudentCapture = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  
  // Form state
  const [rollNumber, setRollNumber] = useState("");
  const [step, setStep] = useState<'input' | 'location' | 'camera' | 'processing' | 'error' | 'already_marked' | 'link_expired'>('input');
  
  // Session and location state
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isWithinClassroom, setIsWithinClassroom] = useState<boolean | null>(null);
  const [distanceFromClassroom, setDistanceFromClassroom] = useState<number | null>(null);
  
  // Camera state
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecognized, setIsRecognized] = useState(false);
  
  // Face data state
  const [studentEmbedding, setStudentEmbedding] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [confidence, setConfidence] = useState<number>(0);
  
  // Result state
  const [error, setError] = useState<string | null>(null);
  const [markedStudentName, setMarkedStudentName] = useState<string | null>(null);
  const [markedRollNumber, setMarkedRollNumber] = useState<string | null>(null);

  // Generate unique key for this session+roll combination
  const getAttendanceKey = (roll: string) => `attendance_marked_${sessionId}_${roll}`;

  // Check if already marked and handle expiration
  useEffect(() => {
    // One Device One Attendance Check
    const deviceKey = `attendance_marked_device_${sessionId}`;
    if (localStorage.getItem(deviceKey)) {
      navigate(`/student/nice-try?sessionId=${sessionId}`);
      return;
    }
    
    checkSessionAndAttendance();
  }, [sessionId]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detections, setDetections] = useState<any[]>([]);

  // Effect to clear boxes after a short delay
  useEffect(() => {
    if (detections.length > 0) {
      const timer = setTimeout(() => {
        setDetections([]);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [detections]);

  // Effect to draw boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !webcamRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to container size
    const video = webcamRef.current.video;
    if (video) {
      const { clientWidth, clientHeight } = video;
      canvas.width = clientWidth;
      canvas.height = clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      detections.forEach((detection) => {
        // Use normalized coordinates for perfect scaling across all devices
        const [nx1, ny1, nx2, ny2] = detection.normalized_bbox || [0,0,0,0];
        
        const scaledX1 = nx1 * clientWidth;
        const scaledY1 = ny1 * clientHeight;
        const scaledX2 = nx2 * clientWidth;
        const scaledY2 = ny2 * clientHeight;
        
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;
        
        const match = detection.match;
        
        // Sublime Design Colors
        let primaryColor = '#ef4444'; // Red for unknown
        
        if (match) {
          primaryColor = '#22c55e'; // Green for verified
        }

        // 1. Draw Corner Markers
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const cornerSize = Math.min(width, height) * 0.2;
        
        // Top Left
        ctx.beginPath();
        ctx.moveTo(scaledX1, scaledY1 + cornerSize);
        ctx.lineTo(scaledX1, scaledY1);
        ctx.lineTo(scaledX1 + cornerSize, scaledY1);
        ctx.stroke();
        
        // Top Right
        ctx.beginPath();
        ctx.moveTo(scaledX2 - cornerSize, scaledY1);
        ctx.lineTo(scaledX2, scaledY1);
        ctx.lineTo(scaledX2, scaledY1 + cornerSize);
        ctx.stroke();
        
        // Bottom Left
        ctx.beginPath();
        ctx.moveTo(scaledX1, scaledY2 - cornerSize);
        ctx.lineTo(scaledX1, scaledY2);
        ctx.lineTo(scaledX1 + cornerSize, scaledY2);
        ctx.stroke();
        
        // Bottom Right
        ctx.beginPath();
        ctx.moveTo(scaledX2 - cornerSize, scaledY2);
        ctx.lineTo(scaledX2, scaledY2);
        ctx.lineTo(scaledX2, scaledY2 - cornerSize);
        ctx.stroke();

        // 2. Label Background (Matched CameraRecognition style)
        if (match) {
          const labelPadding = 12;
          const fontSize = 14;
          ctx.font = `bold ${fontSize}px font-poppins, sans-serif`;
          
          const rollText = match.roll_no ? `Roll: ${match.roll_no}` : '';
          const nameText = match.name || '';
          
          const rollWidth = ctx.measureText(rollText).width;
          const nameWidth = ctx.measureText(nameText).width;
          const labelWidth = Math.max(rollWidth, nameWidth) + (labelPadding * 2);
          const labelHeight = 45;
          
          const labelX = scaledX1 + (width / 2) - (labelWidth / 2);
          const labelY = scaledY2 + 15;

          ctx.save();
          ctx.beginPath();
          const r = 12;
          ctx.moveTo(labelX + r, labelY);
          ctx.lineTo(labelX + labelWidth - r, labelY);
          ctx.quadraticCurveTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + r);
          ctx.lineTo(labelX + labelWidth, labelY + labelHeight - r);
          ctx.quadraticCurveTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - r, labelY + labelHeight);
          ctx.lineTo(labelX + r, labelY + labelHeight);
          ctx.quadraticCurveTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - r);
          ctx.lineTo(labelX, labelY + r);
          ctx.quadraticCurveTo(labelX, labelY, labelX + r, labelY);
          ctx.closePath();
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fill();
          
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${fontSize}px font-poppins, sans-serif`;
          ctx.fillText(rollText, labelX + (labelWidth/2) - (rollWidth/2), labelY + 22);
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = `500 ${fontSize - 2}px font-poppins, sans-serif`;
          ctx.fillText(nameText, labelX + (labelWidth/2) - (nameWidth/2), labelY + 38);
        }
      });
    }
  }, [detections]);

  const checkSessionAndAttendance = async () => {
    try {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        setStep('link_expired');
        setError("This link is invalid or has expired. Please use a valid link.");
        setLoading(false);
        return;
      }

      if (session.status !== 'active') {
        setStep('link_expired');
        setError("This session has ended. The link is no longer valid.");
        setLoading(false);
        return;
      }

      setSessionInfo(session);
      
      // Check if already marked attendance
      let alreadyMarked = false;
      let markedData: any = null;
      
      if (isProduction()) {
        try {
          const response = await fetch(`${API_URL}/check-attendance-status/${sessionId}`, {
            method: 'GET',
            credentials: 'include'
          });
          if (response.ok) {
            const data = await response.json();
            alreadyMarked = data.already_marked;
            markedData = data;
          }
        } catch (err) {
          console.error("Error checking attendance status:", err);
        }
      } else {
        const storedData = localStorage.getItem(getAttendanceKey('any'));
        if (storedData) {
          markedData = JSON.parse(storedData);
          alreadyMarked = markedData?.marked || false;
        }
      }
      
      if (alreadyMarked && markedData) {
        setMarkedStudentName(markedData.studentName || markedData.student_name);
        setMarkedRollNumber(markedData.rollNumber || markedData.roll_number);
        
        // Redirect to Nice Try page as requested for duplicate attempts
        navigate(`/student/nice-try?sessionId=${sessionId}`);
        return;
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Error checking session:", err);
      setStep('error');
      setError("Error loading session. Please try again.");
      setLoading(false);
    }
  };

  // Load specific student's face descriptor
  const loadStudentFaceData = async (roll: string) => {
    if (!sessionInfo) return false;
    
    try {
      // Check browser cache first
      const cacheKey = `student_face_${sessionId}_${roll}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed && parsed.embedding && parsed.studentData) {
            setStudentEmbedding(parsed.embedding);
            setStudentData(parsed.studentData);
            console.log(`Loaded student ${roll} face data from browser cache`);
            return true;
          }
        } catch (e) {
          console.error("Error parsing cached student data", e);
          localStorage.removeItem(cacheKey); // Clear invalid cache
        }
      }
      
      // Fetch from database
      console.log(`Querying DB for roll: ${roll}, branch: ${sessionInfo.branch}, year: ${sessionInfo.year}, div: ${sessionInfo.division}`);
      
      const { data: student, error } = await supabase
        .from("students")
        .select("id, name, roll_no, face_descriptor")
        .eq("roll_no", roll)
        .ilike("branch", sessionInfo.branch) // Use ilike for case-insensitive matching
        .ilike("year", sessionInfo.year)
        .ilike("division", sessionInfo.division)
        .maybeSingle();
      
      if (error || !student) {
        toast.error(`No student found with roll number ${roll}`);
        return false;
      }
      
      if (!student.face_descriptor) {
        toast.error("Face not enrolled for this student");
        return false;
      }
      
      // Parse face descriptor
      let embedding;
      try {
        const desc = JSON.parse(student.face_descriptor);
        embedding = Array.isArray(desc) ? desc : desc.embedding;
      } catch (e) {
        embedding = student.face_descriptor;
      }
      
      // Cache in browser
      const faceData = {
        embedding,
        studentData: {
          id: student.id,
          name: student.name,
          roll_no: student.roll_no
        }
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(faceData));
      setStudentEmbedding(embedding);
      setStudentData(faceData.studentData);
      
      console.log(`Loaded and cached student ${roll} face data`);
      return true;
    } catch (err) {
      console.error("Error loading student face data:", err);
      toast.error("Error loading student data");
      return false;
    }
  };

  const requestLocation = async () => {
    if (!rollNumber.trim()) {
      toast.error("Please enter your roll number");
      return;
    }

    // Check if this specific roll number has already marked attendance
    const attendanceKey = getAttendanceKey(rollNumber.trim());
    const storedData = localStorage.getItem(attendanceKey);
    if (storedData) {
      const markedData = JSON.parse(storedData);
      if (markedData.marked) {
        setMarkedStudentName(markedData.studentName);
        setMarkedRollNumber(markedData.rollNumber);
        setStep('already_marked');
        
        setTimeout(() => {
          navigate(`/student/view/${sessionId}?marked=true&name=${encodeURIComponent(markedData.studentName)}&roll=${markedData.rollNumber}`);
        }, 5000);
        return;
      }
    }

    // Load student face data BEFORE showing camera
    toast.info("Loading your face data...");
    const faceDataLoaded = await loadStudentFaceData(rollNumber.trim());
    
    if (!faceDataLoaded) {
      return;
    }

    setStep('location');
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ lat, lon });
        
        try {
          const response = await fetch(`${API_URL}/validate-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              student_lat: lat,
              student_lon: lon
            })
          });
          
          const validation = await response.json();
          console.log("Validation Response:", validation);

          if (!response.ok) {
            throw new Error(validation.detail || "Validation failed");
          }

          if (validation.valid === true) {
            console.log("Validation successful, setting state...");
            setIsWithinClassroom(true);
            setDistanceFromClassroom(validation.distance_meters);
            toast.success(`Location verified! You're ${validation.distance_meters?.toFixed(1) || 0}m from classroom`);
            
            console.log("Location verified, switching to camera in 1s...");
            // Start camera with auto-detection
            setTimeout(() => {
              console.log("Executing timeout: Setting step to camera");
              setStep('camera');
            }, 1000);
          } else {
            console.log("Location invalid, setting state...");
            setIsWithinClassroom(false);
            setDistanceFromClassroom(validation.distance_meters);
            const dist = validation.distance_meters !== undefined && validation.distance_meters !== null 
              ? validation.distance_meters.toFixed(1) 
              : "unknown";
            setLocationError(`You're ${dist}m away from the classroom. Please move within ${validation.classroom_radius || 15}m.`);
          }
        } catch (err) {
          console.error("Error validating location:", err);
          setLocationError("Error validating location. Please try again.");
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocationError("Unable to get your location. Please enable location permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const captureAndRecognize = useCallback(async () => {
    if (!webcamRef.current || !location || !studentEmbedding || isRecognized) return;

    // Check if video is ready and get dimensions
    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;
    
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setIsProcessing(true);

    try {
      // Convert base64 to blob
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      
      const formData = new FormData();
      formData.append("file", blob, "capture.jpg");

      // Call recognition API with specific roll number for fast comparison
      const response = await fetch(
        `${API_URL}/student-recognize/${sessionId}/${rollNumber}?` + 
        new URLSearchParams({
          student_lat: location.lat.toString(),
          student_lon: location.lon.toString()
        }),
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (data.already_marked) {
        navigate(`/student/nice-try?sessionId=${sessionId}`);
        return;
      }

      if (data.success) {
        // Face matched!
        setIsRecognized(true);
        setFaceDetected(true);
        setConfidence(data.confidence || 0);
        
        // Update detections for drawing box
        if (data.bbox) {
           const [x1, y1, x2, y2] = data.bbox;
           
           setDetections([{
             normalized_bbox: [x1/videoWidth, y1/videoHeight, x2/videoWidth, y2/videoHeight],
             match: { 
               status: "marked_now",
               name: data.student_name,
               roll_no: data.roll_number
             }
           }]);
        }

        // Mark attendance
        await markAttendance(data);
      } else if (data.face_detected) {
        // Face detected but not matched
        setFaceDetected(true);
        setConfidence(data.confidence || 0);
        
        if (data.bbox) {
           const [x1, y1, x2, y2] = data.bbox;
           
           setDetections([{
             normalized_bbox: [x1/videoWidth, y1/videoHeight, x2/videoWidth, y2/videoHeight],
             match: null
           }]);
        }
      } else {
        setFaceDetected(false);
        setDetections([]);
      }
    } catch (err) {
      console.error("Recognition error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, rollNumber, location, studentEmbedding, isRecognized]);

  // Auto recognition loop
  useEffect(() => {
    if (step !== 'camera' || isRecognized) return;

    const interval = setInterval(() => {
      if (!isProcessing && isCameraReady && webcamRef.current) {
        captureAndRecognize();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step, isRecognized, isProcessing, isCameraReady, captureAndRecognize]);

  const markAttendance = async (recognitionData: any) => {
    try {
      // Mark attendance for this device to prevent reuse
      const deviceKey = `attendance_marked_device_${sessionId}`;
      localStorage.setItem(deviceKey, "true");

      // Mark in localStorage for localhost
      if (!isProduction()) {
        const attendanceKey = getAttendanceKey(rollNumber.trim());
        localStorage.setItem(attendanceKey, JSON.stringify({
          marked: true,
          studentName: recognitionData.student_name,
          rollNumber: recognitionData.roll_number,
          timestamp: new Date().toISOString(),
          sessionId: sessionId
        }));
        
        localStorage.setItem(getAttendanceKey('any'), JSON.stringify({
          marked: true,
          studentName: recognitionData.student_name,
          rollNumber: recognitionData.roll_number,
          timestamp: new Date().toISOString(),
          sessionId: sessionId
        }));
      }
      
      // Show success and redirect
      toast.success(`Welcome, ${recognitionData.student_name}! Attendance marked.`);
      
      setTimeout(() => {
        navigate(`/student/view/${sessionId}?marked=true&name=${encodeURIComponent(recognitionData.student_name)}&roll=${recognitionData.roll_number}`);
      }, 1500);
      
    } catch (err) {
      console.error("Error marking attendance:", err);
      setError("Error saving attendance. Please try again.");
      setStep('error');
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setIsCameraReady(false);
  };

  const retryLocation = () => {
    setLocationError(null);
    setIsWithinClassroom(null);
    requestLocation();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F0F10]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-[#0F0F10] text-white p-4 sm:p-6">
        <div className="max-w-md mx-auto pt-20">
          <Card className="p-8 text-center border-red-500/20 bg-red-500/5">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Attendance Failed</h2>
            <p className="text-white/60 mb-6">{error}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Link Expired / Session Ended state
  if (step === 'link_expired') {
    return (
      <div className="min-h-screen bg-[#0F0F10] text-white p-4 sm:p-6">
        <div className="max-w-md mx-auto pt-20">
          <Card className="p-8 text-center border-orange-500/20 bg-orange-500/5">
            <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Link Expired</h2>
            <p className="text-white/60 mb-6">{error || "This link is no longer valid. The session may have ended or the link has expired."}</p>
            <p className="text-white/40 text-sm mb-4">Please contact your teacher for a valid attendance link.</p>
          </Card>
        </div>
      </div>
    );
  }

  // Already Marked state
  if (step === 'already_marked') {
    return (
      <div className="min-h-screen bg-[#0F0F10] text-white p-4 sm:p-6">
        <div className="max-w-md mx-auto pt-20">
          <Card className="p-8 text-center border-green-500/20 bg-green-500/5">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Attendance Already Marked!</h2>
            <p className="text-white/60 mb-2">
              Your attendance has already been recorded for this session.
            </p>
            {markedStudentName && (
              <p className="text-white mb-4">
                Welcome back, <span className="font-semibold text-white">{markedStudentName}</span>!
              </p>
            )}
            <p className="text-white/40 text-sm mb-6">
              Redirecting to attendance list in 5 seconds...
            </p>
            <Button 
              onClick={() => navigate(`/student/view/${sessionId}?marked=true&name=${encodeURIComponent(markedStudentName || '')}&roll=${markedRollNumber || ''}`)} 
              className="w-full"
            >
              View Attendance Now
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F10] text-white p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold font-poppins">Mark Attendance</h1>
            {sessionInfo && (
              <p className="text-white/60 text-xs">
                {sessionInfo.subject} • {sessionInfo.branch} {sessionInfo.year}
              </p>
            )}
          </div>
        </div>

        {/* Step 1: Roll Number Input */}
        {step === 'input' && (
          <Card className="p-6 space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Enter Your Roll Number</h2>
              <p className="text-white/60 text-sm">We'll verify your identity and location</p>
            </div>
            
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="e.g., 30"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                className="text-center text-lg h-12"
                onKeyDown={(e) => e.key === 'Enter' && requestLocation()}
              />
              <Button 
                onClick={requestLocation}
                className="w-full h-12"
                disabled={!rollNumber.trim()}
              >
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Location Validation */}
        {step === 'location' && (
          <Card className="p-6 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Verifying Location</h2>
              <p className="text-white/60 text-sm">Please allow location access</p>
            </div>

            {locationError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-medium mb-1">Location Error</p>
                    <p className="text-white/60 text-sm">{locationError}</p>
                  </div>
                </div>
                <Button 
                  onClick={retryLocation}
                  variant="outline"
                  className="w-full mt-4 border-red-500/50 text-red-500"
                >
                  Retry Location
                </Button>
              </div>
            ) : !location || isWithinClassroom === null ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-white/60 text-sm">Verifying your location...</p>
              </div>
            ) : isWithinClassroom === false ? (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-400 font-medium mb-1">Too Far From Classroom</p>
                    <p className="text-white/60 text-sm">
                      You're {distanceFromClassroom?.toFixed(1)}m away. Please move closer to the classroom.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={retryLocation}
                  variant="outline"
                  className="w-full mt-4 border-yellow-500/50 text-yellow-500"
                >
                  Check Location Again
                </Button>
              </div>
            ) : (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-green-400 font-medium">Location Verified</p>
                    <p className="text-white/60 text-sm">
                      You're {distanceFromClassroom?.toFixed(1)}m from the classroom
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => setStep('camera')}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  Continue to Camera
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Auto Camera Capture - NO BUTTON */}
        {step === 'camera' && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">
                    {isRecognized ? 'Face Verified!' : faceDetected ? 'Scanning Face...' : 'Position Your Face'}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={switchCamera}
                  className="text-xs"
                  disabled={isRecognized}
                >
                  Flip Camera
                </Button>
              </div>

              {/* Status Indicator */}
              <div className="mb-4">
                {isRecognized ? (
                  <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 text-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
                    <p className="text-green-400 text-sm font-medium">Attendance Marked!</p>
                    <p className="text-white/60 text-xs">Redirecting...</p>
                  </div>
                ) : faceDetected ? (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 text-center">
                    <Loader2 className="w-6 h-6 text-yellow-500 mx-auto mb-1 animate-spin" />
                    <p className="text-yellow-400 text-sm">Verifying face...</p>
                    {confidence > 0 && (
                      <p className="text-white/40 text-xs">Confidence: {confidence.toFixed(1)}%</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3 text-center">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                    <p className="text-blue-400 text-sm">Looking for face...</p>
                  </div>
                )}
              </div>

              {cameraError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-red-400 text-sm">{cameraError}</p>
                </div>
              ) : (
                <div className="relative aspect-[3/4] bg-black rounded-lg overflow-hidden flex items-center justify-center">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{
                      facingMode: facingMode,
                      width: 1280,
                      height: 720
                    }}
                    onUserMedia={() => {
                      setIsCameraReady(true);
                      setCameraError(null);
                    }}
                    onUserMediaError={(err) => {
                      console.error("Camera error:", err);
                      setCameraError("Camera access denied. Please allow camera permissions.");
                    }}
                    className="w-full h-full object-cover"
                  />
                  
                  {!isCameraReady && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-white/60 text-sm ml-2">Starting camera...</p>
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full z-20 pointer-events-none"
                  />
                  
                  {/* Visual Guide Overlay (similar to CameraRecognition) */}
                  <div className="absolute inset-0 border-[20px] sm:border-[40px] border-black/40 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-64 h-80 border-2 border-white/30 rounded-[40px] relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <div className="text-center text-white/40 text-xs space-y-1">
              <p>Auto-detecting your face...</p>
              <p>Hold still while we verify your identity</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCapture;
