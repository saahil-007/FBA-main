import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Camera, X, CheckCircle2, UserCheck } from "lucide-react";

const CameraRecognition = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [recognizing, setRecognizing] = useState(false);
  const [lastMatch, setLastMatch] = useState<any>(null);
  const [lastSuccessfullyMarked, setLastSuccessfullyMarked] = useState<any>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [currentBox, setCurrentBox] = useState<number[] | null>(null);
  const [isRecognized, setIsRecognized] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    checkSession();
    
    // Auto-capture interval
    const interval = setInterval(() => {
      if (isCameraReady && !recognizing) {
        captureAndRecognize();
      }
    }, 1500); // Slightly faster interval for real-time feel

    return () => clearInterval(interval);
  }, [isCameraReady, recognizing]);

  // Effect to clear boxes after a short delay
  useEffect(() => {
    if (currentBox) {
      const timer = setTimeout(() => {
        setCurrentBox(null);
        setIsRecognized(false);
        setLastMatch(null); // Face moved away or scan expired
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentBox]);

  // Effect to draw boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !webcamRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video size
    const video = webcamRef.current.video;
    if (video) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (currentBox) {
        const [x1, y1, x2, y2] = currentBox;
        
        // Scale factors: Backend uses the screenshot which is 1280x720 (from videoConstraints)
        const scaleX = canvas.width / 1280;
        const scaleY = canvas.height / 720;
        
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;
        
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;
        
        ctx.lineWidth = 3;
        if (isRecognized) {
          ctx.strokeStyle = '#22c55e'; // Green
          ctx.strokeRect(scaledX1, scaledY1, width, height);
          
          // Only borders, no text or fill as per request
        } else {
          ctx.strokeStyle = '#3b82f6'; // Blue
          ctx.strokeRect(scaledX1, scaledY1, width, height);
          
          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('Detecting...', scaledX1, scaledY1 - 10);
        }
      }
    }
  }, [currentBox, isRecognized]);

  const checkSession = async () => {
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

      const response = await fetch(`http://localhost:8000/recognize/${sessionId}`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      
      if (result.status === "success") {
        if (result.bbox) {
          setCurrentBox(result.bbox);
        } else {
          // If no face detected, let the timeout clear current UI
        }

        if (result.matches && result.matches.length > 0) {
          const match = result.matches[0];
          setIsRecognized(true);
          
          if (match.status === "marked_now") {
            setLastMatch(match);
            setLastSuccessfullyMarked(match);
            toast.success(`Marked Present: ${match.name} (${match.roll_no})`, {
              icon: <UserCheck className="w-5 h-5 text-green-500" />,
              duration: 2000
            });
          } else if (match.status === "already_marked") {
            setLastMatch(match);
            toast.info(`Already Marked: ${match.name} (${match.roll_no})`, {
              icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
              duration: 2000
            });
          } else {
            setLastMatch(match);
          }
        } else {
          setIsRecognized(false);
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl relative">
        {/* Header/Controls */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center">
          <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${recognizing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-white text-sm font-medium">
              {recognizing ? 'Analyzing...' : 'Ready'}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full bg-black/50 border border-white/10 text-white" onClick={() => navigate(-1)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Camera Feed */}
        <Card className="overflow-hidden border-2 border-primary/20 bg-card/10 backdrop-blur-xl relative aspect-video flex items-center justify-center">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: "user",
              width: 1280,
              height: 720
            }}
            onUserMedia={() => setIsCameraReady(true)}
            className="w-full h-full object-cover"
          />
          
          {/* Overlay Canvas for Boxes */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full z-20 pointer-events-none"
          />
          
          {/* Overlay for Face Position */}
          <div className="absolute inset-0 border-[40px] border-black/40 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-80 border-2 border-white/30 rounded-[40px] relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
            </div>
          </div>
        </Card>

        {/* Status / Last Recognized */}
        <div className="mt-8 text-center space-y-4">
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
                Last student marked was roll no - <span className="text-primary">{lastSuccessfullyMarked.roll_no}</span>
              </h3>
              <p className="text-white/40 text-xs mt-1">{lastSuccessfullyMarked.name}</p>
            </div>
          ) : (
            <p className="text-white/60 text-sm">Position your face within the frame to mark attendance</p>
          )}
          
          <Button size="lg" className="w-full h-14 rounded-2xl text-lg font-bold" onClick={captureAndRecognize} disabled={recognizing || !isCameraReady}>
            {recognizing ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Camera className="w-6 h-6 mr-2" />}
            Manual Capture
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CameraRecognition;
