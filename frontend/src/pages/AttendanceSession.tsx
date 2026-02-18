import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Camera, Users, CheckCircle2, Link as LinkIcon, Share2, ArrowLeft, UserCheck, FileText, Table as TableIcon, RefreshCcw, Copy, Check, QrCode } from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, UserPlus } from "lucide-react";
import { API_URL } from "@/config";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useTeacherLocation } from "@/hooks/useTeacherLocation";

const AttendanceSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);
  const [manualStudentIds, setManualStudentIds] = useState<string[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMarking, setIsMarking] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<'loading' | 'cached' | 'fresh' | 'error'>('loading');
  
  // Determine mode from URL path
  const pathParts = window.location.pathname.split('/');
  const version = pathParts[pathParts.length - 2]; // v1 or v2
  const isV2 = version === 'v2'; // Student self-capture mode
  const isV1 = version === 'v1'; // Teacher capture mode
  
  // v2 specific states
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Real-time teacher location state
  const [enableRealTimeLocation, setEnableRealTimeLocation] = useState(false);

  useEffect(() => {
    fetchSessionDetails();
    fetchPresentStudents();
    fetchAllStudents();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || allStudents.length === 0) return;

    const channel = supabase
      .channel(`attendance-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const newRecord = payload.new;
          const student = allStudents.find(s => s.id === newRecord.student_id);
          
          if (student) {
            setPresentStudents(prev => {
              if (prev.some(p => p.id === student.id)) return prev;
              return [...prev, student];
            });
          } else {
            fetchPresentStudents();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, allStudents]);

  // Real-time teacher location hook
  const { location: teacherLocation, error: locationError } = useTeacherLocation({
    sessionId: sessionId || '',
    enabled: enableRealTimeLocation && session?.status === 'active',
    updateInterval: 3000 // 3 seconds as requested
  });

  // Enable real-time location when session is active
  useEffect(() => {
    if (session?.status === 'active') {
      setEnableRealTimeLocation(true);
    } else {
      setEnableRealTimeLocation(false);
    }
  }, [session?.status]);

  // Show location error if any
  useEffect(() => {
    if (locationError) {
      toast.error(`Location update error: ${locationError}`);
    }
  }, [locationError]);

  const fetchAllStudents = async () => {
    if (!session) return;
    
    const cacheKey = `descriptors_${session.branch}_${session.year}_${session.division}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        const students = JSON.parse(cachedData);
        if (Array.isArray(students) && students.length > 0) {
          setAllStudents(students);
          setCacheStatus('cached');
          console.log(`Loaded ${students.length} students from browser cache`);
          
          // If in teacher mode, check if we have descriptors
          if (isV1 && !students[0].face_descriptor) {
            console.log("Cache missing descriptors for teacher mode, refetching...");
            setCacheStatus('loading');
            await fetchStudentsFromDB();
            return;
          }

          // Only refresh in background if NOT in teacher mode (to save bandwidth/DB calls)
          // or if user specifically requested strict cache usage, we skip it.
          // User request: "check if they exist in cache , if not then and only then make db call"
          // So we skip refreshStudentCache() if we found valid data.
          return; 
        }
      } catch (e) {
        console.error("Cache parse error:", e);
        setCacheStatus('error');
      }
    }

    // Fetch from DB if not in cache or cache failed
    setCacheStatus('loading');
    await fetchStudentsFromDB();
  };

  const refreshStudentCache = async () => {
    // Background refresh for cache validation
    try {
      // Only load descriptors if in teacher mode (v1)
      const selectQuery = isV1 
        ? "id, name, roll_no, face_descriptor" 
        : "id, name, roll_no";

      const { data, error } = await supabase
        .from("students")
        .select(selectQuery)
        .ilike("branch", session.branch)
        .ilike("year", session.year)
        .ilike("division", session.division);
        
      if (!error && data && data.length > 0) {
        const cacheKey = `descriptors_${session.branch}_${session.year}_${session.division}`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
        console.log(`Background refresh: Updated cache with ${data.length} students`);
      }
    } catch (e) {
      console.error("Background cache refresh failed:", e);
    }
  };

  const fetchStudentsFromDB = async () => {
    // Only load descriptors if in teacher mode (v1)
    const selectQuery = isV1 
      ? "id, name, roll_no, face_descriptor" 
      : "id, name, roll_no";

    const { data, error } = await supabase
      .from("students")
      .select(selectQuery)
      .ilike("branch", session.branch)
      .ilike("year", session.year)
      .ilike("division", session.division);
      
    if (error) {
      console.error("Error fetching students:", error);
      toast.error("Error fetching students list");
      setCacheStatus('error');
      return;
    }

    if (data && data.length > 0) {
      setAllStudents(data);
      setCacheStatus('fresh');
      const cacheKey = `descriptors_${session.branch}_${session.year}_${session.division}`;
      localStorage.setItem(cacheKey, JSON.stringify(data));
      console.log(`Fetched ${data.length} students from database and cached them`);
    } else {
      setCacheStatus('error');
    }
  };

  useEffect(() => {
    if (session) fetchAllStudents();
  }, [session]);

  const handleManualMark = async () => {
    if (manualStudentIds.length === 0) return;
    
    setIsMarking(true);
    try {
      const records = manualStudentIds.map(id => ({
        session_id: sessionId,
        student_id: id
      }));

      const { error } = await supabase
        .from("attendance_records")
        .insert(records);

      if (error) {
        if (error.code === '23505') toast.error("Some students were already marked present");
        else throw error;
      } else {
        toast.success(`${manualStudentIds.length} student(s) marked present`);
        
        // Update local state for immediate UI feedback
        const newlyMarkedStudents = allStudents.filter(s => manualStudentIds.includes(s.id));
        setPresentStudents(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const filteredNew = newlyMarkedStudents.filter(s => !existingIds.has(s.id));
          return [...prev, ...filteredNew];
        });

        setManualStudentIds([]);
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error("Error marking students:", error);
      toast.error("Failed to mark students");
    } finally {
      setIsMarking(false);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setManualStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId) 
        : [...prev, studentId]
    );
  };

  const fetchSessionDetails = async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      toast.error("Session not found");
      navigate("/dashboard");
      return;
    }

    // Check if session is older than 1 hour and still active
    // Temporarily disable this logic to prevent premature session completion
    // if (data.status === 'active') {
    //   const createdAt = new Date(data.created_at).getTime();
    //   const now = new Date().getTime();
    //   const oneHour = 60 * 60 * 1000;

    //   if (now - createdAt > oneHour) {
    //     data.status = 'completed';
    //     // Optionally notify the user or update the DB (though backend already handles DB)
    //   }
    // }

    setSession(data);
    setLoading(false);
    
    // Debug log for session status
    console.log("Session loaded:", {
      id: data.id,
      status: data.status,
      created_at: data.created_at,
      classroom: data.classroom
    });
  };

  const fetchPresentStudents = async () => {
    const { data, error } = await supabase
      .from("attendance_records")
      .select(`
        student_id,
        students (
          id,
          name,
          roll_no
        )
      `)
      .eq("session_id", sessionId);

    if (error) {
      console.error("Error fetching present students:", error);
      return;
    }

    if (data) {
      const formatted = data.map((item: any) => {
        const student = Array.isArray(item.students) ? item.students[0] : item.students;
        return {
          id: item.student_id,
          name: student?.name || "Unknown",
          roll_no: student?.roll_no || "N/A"
        };
      });
      console.log(`Fetched ${formatted.length} present students`);
      setPresentStudents(formatted);
    }
  };

  const endSession = async () => {
    const { error } = await supabase
      .from("sessions")
      .update({ status: 'completed' })
      .eq("id", sessionId);

    if (error) {
      toast.error("Failed to end session");
    } else {
      toast.success("Session ended and saved");
      fetch(`${API_URL}/clear-session-cache/${sessionId}`, { method: 'POST' }).catch(console.error);
      setSession(prev => ({ ...prev, status: 'completed' }));
    }
  };

  const getShareUrl = (path: string) => {
    return `${window.location.origin}${path}`;
  };

  const copyToClipboard = (path: string) => {
    const url = getShareUrl(path);
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const handleShare = async (path: string, title: string) => {
    const url = getShareUrl(path);
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Join the attendance session for ${session?.subject}`,
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          copyToClipboard(path);
        }
      }
    } else {
      copyToClipboard(path);
    }
  };

  const openInNewTab = (path: string) => {
    window.open(path, '_blank');
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      setExporting(format);
      const response = await fetch(`${API_URL}/sessions/${sessionId}/export/${format}`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_${session.subject}_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Exported as ${format.toUpperCase()} successfully`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    } finally {
      setExporting(null);
    }
  };

  // v2 specific functions
  useEffect(() => {
    if (isV2 && session) {
      // Get student count for this class
      const fetchStudentCount = async () => {
        const { count } = await supabase
          .from("students")
          .select("*", { count: 'exact', head: true })
          .eq("branch", session.branch)
          .eq("year", session.year)
          .eq("division", session.division);
        
        if (count !== null) setTotalStudents(count);
      };
      
      fetchStudentCount();
      
      // Get initial attendance count
      const fetchAttendanceCount = async () => {
        const { count } = await supabase
          .from("attendance_records")
          .select("*", { count: 'exact', head: true })
          .eq("session_id", sessionId);
        
        if (count !== null) setAttendanceCount(count);
      };
      
      fetchAttendanceCount();
      
      // Subscribe to realtime updates
      const subscription = supabase
        .channel(`attendance_${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'attendance_records',
            filter: `session_id=eq.${sessionId}`
          },
          () => {
            setAttendanceCount(prev => prev + 1);
          }
        )
        .subscribe();
      
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isV2, session, sessionId]);

  const getStudentCaptureLink = () => {
    if (!sessionId) return "";
    const baseUrl = window.location.origin;
    return `${baseUrl}/student-capture/${sessionId}`;
  };

  const copyStudentLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getStudentCaptureLink());
      setCopiedLink(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const shareToWhatsApp = () => {
    const link = getStudentCaptureLink();
    const text = `📚 Attendance Session Opened!%0A%0ASubject: ${session?.subject || 'N/A'}%0AClass: ${session?.branch} ${session?.year} Div ${session?.division}%0A%0AMark your attendance here:%0A${link}%0A%0A⚠️ You must be within the classroom to mark attendance.`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const absentStudents = allStudents.filter(
    s => !presentStudents.some(p => p.id === s.id)
  );

  const filteredAbsentStudents = absentStudents.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.roll_no.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => a.roll_no.localeCompare(b.roll_no));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/dashboard")}
              className="h-9 w-9 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="truncate">
              <h1 className="text-sm font-bold truncate">{session?.subject || "Session"}</h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {session?.branch} • {session?.year} • Div {session?.division}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isV2 && (
              <Badge variant="outline" className="bg-purple-500/10 border-purple-500 text-purple-500 text-xs">
                v2
              </Badge>
            )}
            {isV1 && (
              <Badge variant="outline" className="bg-blue-500/10 border-blue-500 text-blue-500 text-xs">
                v1
              </Badge>
            )}
            <Badge className={session?.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}>
              {session?.status === 'active' ? 'Active' : 'Completed'}
            </Badge>
          </div>
          {cacheStatus === 'cached' && (
            <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500 text-yellow-500 text-xs">
              Cached
            </Badge>
          )}
          {cacheStatus === 'fresh' && (
            <Badge variant="outline" className="bg-green-500/10 border-green-500 text-green-500 text-xs">
              Fresh
            </Badge>
          )}
          {cacheStatus === 'loading' && (
            <Badge variant="outline" className="bg-blue-500/10 border-blue-500 text-blue-500 text-xs">
              Loading...
            </Badge>
          )}
        </div>
      </header>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Main Content - Only show when not loading */}
      {!loading && (
        <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        
        {/* Debug Session Info - REMOVED */}

        {/* v2: Student Self-Capture Mode UI */}
        {isV2 && (
          <>
            {/* Live Attendance Progress */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="text-5xl font-bold text-primary">
                    {attendanceCount}<span className="text-2xl text-muted-foreground">/{totalStudents}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Students Present</p>
                  <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${totalStudents > 0 ? (attendanceCount / totalStudents) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Share Link */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Share with Students
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-2">
                  <Input 
                    value={getStudentCaptureLink()}
                    readOnly
                    className="text-xs bg-muted"
                  />
                  <Button 
                    size="icon"
                    variant="outline"
                    onClick={copyStudentLinkToClipboard}
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <Button 
                  onClick={shareToWhatsApp}
                  className="w-full"
                  variant="outline"
                >
                  Share to WhatsApp
                </Button>
              </CardContent>
            </Card>

            {/* Instructions */}
            {/* <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Students open the link on their phones</li>
                <li>They enter their roll number</li>
                <li>Location is verified (must be in classroom)</li>
                <li>Face is matched against enrolled photo</li>
                <li>Liveness check prevents photo spoofing</li>
              </ul>
            </div> */}
          </>
        )}

        {/* v1: Teacher Capture Mode - Session Stats */}
        {!isV2 && (
          <>
        {/* Session Stats */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
          <Card className="min-w-[80px] flex-1 bg-primary/10 border-primary/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-primary">{presentStudents.length}</div>
              <div className="text-[10px] text-primary/80">Present</div>
            </CardContent>
          </Card>
          <Card className="min-w-[80px] flex-1 bg-orange-500/10 border-orange-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-500">{absentStudents.length}</div>
              <div className="text-[10px] text-orange-500/80">Absent</div>
            </CardContent>
          </Card>
          <Card className="min-w-[80px] flex-1 bg-card/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{allStudents.length}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card className="min-w-[80px] flex-1 bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">
                {allStudents.length > 0 ? Math.round((presentStudents.length / allStudents.length) * 100) : 0}%
              </div>
              <div className="text-[10px] text-blue-500/80">Att.</div>
            </CardContent>
          </Card>
        </div>


          </>
        )}

        {/* Manual Marking */}
        {session?.status === 'active' && (
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" />
                Manual Marking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full h-11 justify-between text-muted-foreground font-normal">
                    <span className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-primary" />
                      Select multiple students...
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5">{manualStudentIds.length} selected</Badge>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] w-full sm:max-w-md p-0 overflow-hidden gap-0">
                  <DialogHeader className="p-4 border-b">
                    <DialogTitle className="text-base mb-2">Select Students</DialogTitle>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or roll no..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-10 bg-muted/50"
                      />
                    </div>
                  </DialogHeader>
                  <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
                    {filteredAbsentStudents.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        {searchQuery ? "No matching students found" : "All students marked present"}
                      </div>
                    ) : (
                      filteredAbsentStudents.map((student) => (
                        <div
                          key={student.id}
                          className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                            manualStudentIds.includes(student.id) 
                              ? "bg-primary/10 border-primary/20 border" 
                              : "hover:bg-muted/50 border border-transparent"
                          }`}
                          onClick={() => toggleStudentSelection(student.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                              manualStudentIds.includes(student.id) 
                                ? "bg-primary border-primary" 
                                : "border-muted-foreground/30"
                            }`}>
                              {manualStudentIds.includes(student.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-primary">Roll: {student.roll_no}</div>
                              <div className="text-xs text-muted-foreground">{student.name}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] h-5">Absent</Badge>
                        </div>
                      ))
                    )}
                  </div>
                  <DialogFooter className="p-4 border-t bg-muted/20">
                    <Button 
                      onClick={handleManualMark} 
                      disabled={manualStudentIds.length === 0 || isMarking}
                      className="w-full h-11"
                    >
                      {isMarking ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Marking...
                        </>
                      ) : (
                        `Mark ${manualStudentIds.length} Student(s) Present`
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {session?.status === 'active' ? (
                <>
                  {isV2 ? (
                    // v2: Student Self-Capture Mode
                    <>
                      <div className="col-span-2 space-y-2">
                        <Button 
                          variant="default"
                          className="w-full h-20 flex-col gap-1"
                          onClick={() => openInNewTab(`/student-capture/${sessionId}`)}
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-xs">Student Capture Link</span>
                        </Button>
                        <Button 
                          variant="secondary"
                          size="sm"
                          className="w-full gap-2 h-9"
                          onClick={() => handleShare(`/student-capture/${sessionId}`, "Student Attendance Capture")}
                        >
                          <Share2 className="w-4 h-4" />
                          Share to Students
                        </Button>
                      </div>
                    </>
                  ) : (
                    // v1: Teacher Capture Mode
                    <>
                      <div className="space-y-2">
                        <Button 
                          variant="default"
                          className="w-full h-20 flex-col gap-1"
                          onClick={() => openInNewTab(`/student/camera/${sessionId}`)}
                        >
                          <Camera className="w-6 h-6" />
                          <span className="text-xs">Open Camera</span>
                        </Button>
                        <Button 
                            variant="secondary"
                            size="sm"
                            className="w-full gap-2 h-9"
                            onClick={() => handleShare(`/student/camera/${sessionId}`, "Attendance Camera")}
                          >
                            <Share2 className="w-4 h-4" />
                            Share Camera
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Button 
                            variant="outline"
                            className="w-full h-20 flex-col gap-1"
                            onClick={() => openInNewTab(`/student/view/${sessionId}`)}
                          >
                            <Users className="w-6 h-6" />
                            <span className="text-xs">View List</span>
                          </Button>
                          <Button 
                            variant="secondary"
                            size="sm"
                            className="w-full gap-2 h-9"
                            onClick={() => handleShare(`/student/view/${sessionId}`, "Attendance List")}
                          >
                            <Share2 className="w-4 h-4" />
                            Share List
                          </Button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    className="h-14 gap-2"
                    onClick={() => handleExport('csv')}
                    disabled={exporting !== null}
                  >
                    {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableIcon className="h-4 w-4" />}
                    CSV
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-14 gap-2"
                    onClick={() => handleExport('pdf')}
                    disabled={exporting !== null}
                  >
                    {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    PDF
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* End Session Button */}
        {session?.status === 'active' && (
          <Button 
            variant="destructive" 
            className="w-full h-12"
            onClick={endSession}
          >
            End Session & Save
          </Button>
        )}

        {/* Present Students List */}
        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Present ({presentStudents.length})
            </CardTitle>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={fetchPresentStudents}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {presentStudents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {session?.status === 'completed' ? (
                  <div className="space-y-2">
                    <div>Session completed - no attendance recorded</div>
                    <div className="text-xs text-muted-foreground/60">
                      This session has no attendance records. 
                      {allStudents.length > 0 && "Students loaded successfully from cache."}
                    </div>
                  </div>
                ) : (
                  <div>No students marked yet</div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {presentStudents
                  .sort((a, b) => a.roll_no.localeCompare(b.roll_no))
                  .map((student, index) => (
                    <div key={student.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                        <div>
                          <div className="font-bold text-sm text-primary">Roll: {student.roll_no}</div>
                          <div className="text-xs text-muted-foreground">{student.name}</div>
                        </div>
                      </div>
                      <Badge className="bg-green-500/10 text-green-500">Present</Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      )}

      <MobileBottomNav />
    </div>
  );
};

export default AttendanceSession;
