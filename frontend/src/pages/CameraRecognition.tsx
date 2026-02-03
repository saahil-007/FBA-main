import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Camera, X,CheckCircle2, UserCheck, RotateCcw } from "lucide-react";

import { API_URL } from "@/config";

const CameraRecognition = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [recognizing, setRecognizing] = useState(false);
  const [lastMatch, setLastMatch] = useState<any>(null);
  const [lastSuccessfullyMarked, setLastSuccessfullyMarked] = useState<any>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [detections, setDetections] = useState<any[]>([]);
  const [isRecognized, setIsRecognized] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false); // Default to false
  const [isProcessing, setIsProcessing] = useState(false); // Control start/stop
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isTeacher, setIsTeacher] = useState(false);

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setIsCameraReady(false);
    setTimeout(() => setIsCameraReady(true), 100);
  };

  const handleFinish = async () => {
    if (!isTeacher) return;
    try {
      // Mark session as completed in Supabase
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      
      if (error) throw error;
      
      // Clear backend cache
      fetch(`${API_URL}/clear-session-cache/${sessionId}`, { method: 'POST' }).catch(console.error);

      toast.success("Attendance session completed");
      navigate(`/teacher/new-attendance/${sessionId}`); // Go back to session details
    } catch (error) {
      console.error("Error finishing session:", error);
      toast.error("Failed to finish session");
    }
  };

  const toggleProcessing = () => {
    if (!isCameraActive) {
      setIsCameraActive(true);
      setIsProcessing(true);
    } else {
      setIsProcessing(!isProcessing);
    }
  };

  useEffect(() => {
    checkSession();
    
    // Auto-capture interval
    const interval = setInterval(() => {
      if (isCameraReady && !recognizing && isProcessing) {
        captureAndRecognize();
      }
    }, 1000); // 1s interval is more stable for "universal" use across devices

    return () => clearInterval(interval);
  }, [isCameraReady, recognizing, isProcessing]);

  // Effect to clear boxes after a short delay
  useEffect(() => {
    if (detections.length > 0) {
      const timer = setTimeout(() => {
        setDetections([]);
        setIsRecognized(false);
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
          if (match.status === "marked_now") {
            primaryColor = '#22c55e'; // Green
          } else if (match.status === "already_marked") {
            primaryColor = '#3b82f6'; // Blue
          } else {
            primaryColor = '#eab308'; // Yellow
          }
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

        // 2. Label Background
        if (match) {
          const labelPadding = 12;
          const fontSize = 14;
          ctx.font = `bold ${fontSize}px font-poppins, sans-serif`;
          
          const nameText = match.name;
          const subText = match.roll_no ? `#${match.roll_no}` : '';
          
          const nameWidth = ctx.measureText(nameText).width;
          const subWidth = ctx.measureText(subText).width;
          const labelWidth = Math.max(nameWidth, subWidth) + (labelPadding * 2);
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
          ctx.fillText(nameText, labelX + (labelWidth/2) - (nameWidth/2), labelY + 22);
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = `500 ${fontSize - 2}px font-poppins, sans-serif`;
          ctx.fillText(subText, labelX + (labelWidth/2) - (subWidth/2), labelY + 38);
        }
      });
    }
  }, [detections]);

  const checkSession = async () => {
    try {
      // 1. Check session status and teacher
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("status, teacher_id")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        toast.error("Session not found");
        navigate("/dashboard");
        return;
      }

      if (session.status !== 'active') {
        toast.error("Session is no longer active.");
        navigate("/dashboard");
        return;
      }

      // 2. Check if current user is the teacher
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === session.teacher_id) {
        setIsTeacher(true);
      }

    } catch (err) {
      console.error("Error checking session/access:", err);
    }
    
    setLoading(false);
  };

  const captureAndRecognize = useCallback(async () => {
    if (!webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setRecognizing(true);
    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      
      const formData = new FormData();
      formData.append("file", blob, "capture.jpg");

      const response = await fetch(`${API_URL}/recognize/${sessionId}`, {
        method: "POST",
        body: formData,
      });

      if (response.status === 403) {
        const errorData = await response.json();
        toast.error(errorData.detail || "Access denied");
        navigate("/dashboard");
        return;
      }

      if (response.status === 503) {
        const errorData = await response.json();
        const detail = errorData.detail;
        const msg = typeof detail === 'object' ? detail.message : (detail || "Service initializing");
        toast.error(msg, {
          description: "The face recognition models are still loading. This usually takes 1-2 minutes after deployment.",
          duration: 3000
        });
        setRecognizing(false);
        // Wait a bit longer before next capture attempt
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
      }

      const result = await response.json();
      
      if (result.status === "success") {
        const currentDetections = result.detections || [];
        setDetections(currentDetections);

        // Track matches for the summary UI and toasts
        const matches = currentDetections.filter((d: any) => d.match).map((d: any) => d.match);
        
        if (matches.length > 0) {
          setIsRecognized(true);
          
          // Show toasts for newly marked students
          const newlyMarked = matches.filter((m: any) => m.status === "marked_now");
          if (newlyMarked.length > 0) {
            if (newlyMarked.length === 1) {
              toast.success(`Marked Present: ${newlyMarked[0].name}`, {
                icon: <UserCheck className="w-5 h-5 text-green-500" />,
                duration: 2000
              });
            } else {
              toast.success(`Marked ${newlyMarked.length} students present`, {
                icon: <UserCheck className="w-5 h-5 text-green-500" />,
                duration: 2000
              });
            }
            setLastSuccessfullyMarked(newlyMarked[0]);
          }

          // Update lastMatch with the most prominent one for the summary UI
          setLastMatch(matches[0]);
        }
      }
    } catch (error) {
      console.error("Recognition error:", error);
    } finally {
      setRecognizing(false);
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F10] text-white p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="text-lg sm:text-xl font-bold font-poppins">Active Session</h1>
            <p className="text-white/60 text-xs sm:text-sm">Real-time Recognition</p>
          </div>
          <div className="flex gap-2">
            {isCameraActive && (
              <Button 
                variant="outline" 
                size="sm" 
                className={`text-xs h-9 px-4 border-2 ${isProcessing ? 'border-red-500 text-red-500 hover:bg-red-500/10' : 'border-green-500 text-green-500 hover:bg-green-500/10'}`}
                onClick={toggleProcessing}
              >
                {isProcessing ? 'Stop' : 'Start'}
              </Button>
            )}
            {isTeacher && (
              <Button 
                variant="default" 
                size="sm" 
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg h-9 px-4 font-bold"
                onClick={handleFinish}
              >
                Finish Session
              </Button>
            )}
          </div>
        </div>

        {/* Camera Feed Section */}
        <div className="space-y-4">
          {cameraError && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-sm text-red-400 space-y-2">
              <p className="font-bold flex items-center gap-2">
                <X className="w-4 h-4" /> Camera Access Blocked
              </p>
              <p className="text-xs opacity-80">
                Browsers block camera on HTTP (except localhost). To fix this:
              </p>
              <ul className="list-disc list-inside text-[10px] space-y-1 opacity-70">
                <li>Use HTTPS (e.g., ngrok or deploy the site)</li>
                <li>On Android Chrome: Go to <code className="bg-black/20 px-1">chrome://flags</code>, search for "unsafely-treat-insecure-origin-as-secure", add your PC's IP, and enable it.</li>
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/60 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Camera Feed
            </h2>
            <div className="flex gap-2">
              {isCameraActive && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs h-7 px-2 border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
                  onClick={switchCamera}
                  title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline ml-1">Flip</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className={`text-xs h-7 px-3 ${isCameraActive ? 'border-red-500/50 text-red-500 hover:bg-red-500/10' : 'border-green-500/50 text-green-500 hover:bg-green-500/10'}`}
                onClick={() => setIsCameraActive(!isCameraActive)}
              >
                {isCameraActive ? "Stop Camera" : "Start Camera"}
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden border-2 border-primary/20 bg-card/10 backdrop-blur-xl relative aspect-[9/16] sm:aspect-video flex items-center justify-center">
            {isCameraActive ? (
              <>
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
                    setCameraError(err.toString());
                    toast.error("Camera access failed", {
                      description: "Check if you are on HTTPS or localhost."
                    });
                  }}
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full z-20 pointer-events-none"
                />
                <div className="absolute inset-0 border-[20px] sm:border-[40px] border-black/40 flex items-center justify-center pointer-events-none">
                  <div className="w-72 h-96 sm:w-64 sm:h-80 border-2 border-white/30 rounded-[40px] relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 text-white/40">
                <div className="p-4 rounded-full bg-white/5 border border-white/10">
                  <Camera className="w-12 h-12 opacity-20" />
                </div>
                <p className="text-sm font-medium">
                  {!isCameraActive ? "Camera is inactive" : "Processing is stopped"}
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-primary text-primary hover:bg-primary/10"
                  onClick={toggleProcessing}
                >
                  {!isCameraActive ? "Enable Camera" : "Resume Recognition"}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Recognition Status Area */}
        <div className="space-y-6">
          <div className="text-center">
            {lastMatch ? (
              <div className={`px-6 py-4 rounded-2xl animate-in fade-in slide-in-from-bottom-4 border ${
                lastMatch.status === "already_marked" 
                  ? "bg-blue-500/10 border-blue-500/20" 
                  : "bg-green-500/10 border-green-500/20"
              }`}>
                <p className={`${
                  lastMatch.status === "already_marked" ? "text-blue-500" : "text-green-500"
                } text-sm font-medium mb-1`}>
                  {lastMatch.status === "already_marked" ? "Already Marked" : "Successfully Marked"}
                </p>
                <h3 className="text-white text-xl font-bold">
                  {lastMatch.name} <span className="text-white/60 font-medium">({lastMatch.roll_no})</span>
                </h3>
              </div>
            ) : lastSuccessfullyMarked ? (
              <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl animate-in fade-in slide-in-from-bottom-4">
                <p className="text-white/60 text-sm font-medium mb-1">Recent Activity</p>
                <h3 className="text-white text-lg font-semibold">
                  Last student marked: <span className="text-primary">{lastSuccessfullyMarked.roll_no}</span>
                </h3>
                <p className="text-white/40 text-xs mt-1">{lastSuccessfullyMarked.name}</p>
              </div>
            ) : (
              <p className="text-white/60 text-sm">Position your face within the frame to mark attendance</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraRecognition;
