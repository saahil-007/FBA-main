import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Camera, X,CheckCircle2, UserCheck } from "lucide-react";

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
  const [isCameraActive, setIsCameraActive] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleFinish = async () => {
    try {
      // Mark session as completed in Supabase
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      
      if (error) throw error;
      
      toast.success("Session finished successfully");
      navigate(`/teacher/new-attendance/${sessionId}`);
    } catch (error) {
      console.error("Error finishing session:", error);
      toast.error("Failed to finish session");
    }
  };

  useEffect(() => {
    checkSession();
    
    // Auto-capture interval
    const interval = setInterval(() => {
      if (isCameraReady && !recognizing) {
        captureAndRecognize();
      }
    }, 750); // Faster interval for real-time feel

    return () => clearInterval(interval);
  }, [isCameraReady, recognizing]);

  // Effect to clear boxes after a short delay
  useEffect(() => {
    if (detections.length > 0) {
      const timer = setTimeout(() => {
        setDetections([]);
        setIsRecognized(false);
        // setLastMatch(null); // Don't clear lastMatch here, it's used for the summary UI
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [detections]);

  // Effect to draw boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !webcamRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video size
    const video = webcamRef.current.video;
    if (video) {
      const { clientWidth, clientHeight, videoWidth, videoHeight } = video;
      canvas.width = clientWidth;
      canvas.height = clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate scaling accurately
      // Backend uses 1280x720 screenshot as per videoConstraints
      const scaleX = clientWidth / 1280;
      const scaleY = clientHeight / 720;

      detections.forEach((detection) => {
        const [x1, y1, x2, y2] = detection.bbox;
        const match = detection.match;
        
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;
        
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;
        
        // Sublime Design Colors
        let primaryColor = '#ef4444'; // Red for unknown
        let statusText = 'Unknown Student';
        
        if (match) {
          if (match.status === "marked_now") {
            primaryColor = '#22c55e'; // Green
            statusText = match.name;
          } else if (match.status === "already_marked") {
            primaryColor = '#3b82f6'; // Blue
            statusText = match.name;
          } else {
            primaryColor = '#eab308'; // Yellow
            statusText = match.name;
          }
        }

        // 1. Draw Subtle Corner Markers (Sublime Look)
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

        // 2. Draw Semi-transparent Fill on hover-like detection
        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 0.05;
        ctx.fillRect(scaledX1, scaledY1, width, height);
        ctx.globalAlpha = 1.0;

        // 3. Draw Accurate Label (Sublime Design)
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

          // Glassmorphism Label Background
          ctx.save();
          ctx.beginPath();
          const r = 12; // corner radius
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
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.fill();
          
          // Bottom Accent Line
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(labelX + 15, labelY + labelHeight);
          ctx.lineTo(labelX + labelWidth - 15, labelY + labelHeight);
          ctx.stroke();
          ctx.restore();

          // Text Rendering
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(nameText, labelX + (labelWidth/2) - (nameWidth/2), labelY + 22);
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = `500 ${fontSize - 2}px font-poppins, sans-serif`;
          ctx.fillText(subText, labelX + (labelWidth/2) - (subWidth/2), labelY + 38);
        } else {
          // Unknown Student Label
          ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          const unknownText = 'UNKNOWN';
          const uWidth = ctx.measureText(unknownText).width;
          ctx.fillRect(scaledX1 + (width/2) - (uWidth/2) - 8, scaledY1 - 25, uWidth + 16, 20);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(unknownText, scaledX1 + (width/2) - (uWidth/2), scaledY1 - 11);
        }
      });
    }
  }, [detections]);

  const checkSession = async () => {
    try {
      // 1. Check if session is active via Supabase
      const { data, error } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", sessionId)
        .single();

      if (error || !data || data.status !== 'active') {
        toast.error("Session is not active or not found");
        navigate("/dashboard");
        return;
      }

      // 2. Check device access via Backend (First device wins)
      const accessRes = await fetch(`${API_URL}/sessions/${sessionId}/check-access`);
      if (accessRes.ok) {
        const accessData = await accessRes.json();
        if (accessData.status === 'denied') {
          toast.error(accessData.message);
          navigate("/dashboard");
          return;
        }
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

      const result = await response.json();
      
      if (result.status === "success") {
        const currentDetections = result.detections || [];
        setDetections(currentDetections);

        // Update the summary UI with the first matched student in this frame
        const firstMatch = currentDetections.find((d: any) => d.match)?.match;
        
        if (firstMatch) {
          setIsRecognized(true);
          
          if (firstMatch.status === "marked_now") {
            setLastMatch(firstMatch);
            setLastSuccessfullyMarked(firstMatch);
            toast.success(`Marked Present: ${firstMatch.name} (${firstMatch.roll_no})`, {
              icon: <UserCheck className="w-5 h-5 text-green-500" />,
              duration: 2000
            });
          } else if (firstMatch.status === "already_marked") {
            setLastMatch(firstMatch);
            toast.info(`Already Marked: ${firstMatch.name} (${firstMatch.roll_no})`, {
              icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
              duration: 2000
            });
          } else {
            setLastMatch(firstMatch);
          }
        } else {
          // If no matches in this frame, we don't necessarily clear lastMatch 
          // because it will be cleared by the timeout effect anyway.
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
    <div className="min-h-screen bg-[#0F0F10] text-white p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
            <X className="h-6 w-6" />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold font-poppins">Active Session</h1>
            <p className="text-white/60 text-sm">Real-time Recognition</p>
          </div>
          <Button 
            variant="default" 
            size="sm" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
            onClick={handleFinish}
          >
            Finish
          </Button>
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
            <Button 
              variant="outline" 
              size="sm" 
              className={`text-xs h-7 px-3 ${isCameraActive ? 'border-red-500/50 text-red-500 hover:bg-red-500/10' : 'border-green-500/50 text-green-500 hover:bg-green-500/10'}`}
              onClick={() => setIsCameraActive(!isCameraActive)}
            >
              {isCameraActive ? "Stop Camera" : "Start Camera"}
            </Button>
          </div>

          <Card className="overflow-hidden border-2 border-primary/20 bg-card/10 backdrop-blur-xl relative aspect-video flex items-center justify-center">
            {isCameraActive ? (
              <>
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    facingMode: "user",
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
                <div className="absolute inset-0 border-[40px] border-black/40 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-80 border-2 border-white/30 rounded-[40px] relative">
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
                <p className="text-sm font-medium">Camera is inactive</p>
                <Button variant="outline" size="sm" onClick={() => setIsCameraActive(true)}>
                  Enable Camera
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
