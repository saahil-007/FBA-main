import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Camera, Users, CheckCircle2, Link as LinkIcon, Share2, ArrowLeft, UserCheck, FileText, Table as TableIcon, RefreshCcw } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL } from "@/config";
import { MobileBottomNav } from "@/components/MobileBottomNav";

const AttendanceSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);
  const [manualStudentId, setManualStudentId] = useState("");
  const [allStudents, setAllStudents] = useState<any[]>([]);

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

  const fetchAllStudents = async () => {
    if (!session) return;
    
    console.log("Fetching all students for session:", {
      branch: session.branch,
      year: session.year,
      division: session.division
    });

    const cacheKey = `descriptors_${session.branch}_${session.year}_${session.division}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    let students = [];
    if (cachedData) {
      try {
        students = JSON.parse(cachedData);
        if (Array.isArray(students) && students.length > 0) {
          setAllStudents(students);
        }
      } catch (e) {
        console.error("Cache parse error:", e);
      }
    }

    // Try case-insensitive match for better compatibility
    const { data, error } = await supabase
      .from("students")
      .select("id, name, roll_no")
      .ilike("branch", session.branch)
      .ilike("year", session.year)
      .ilike("division", session.division);
      
    if (error) {
      console.error("Error fetching students:", error);
      toast.error("Error fetching students list");
      return;
    }

    console.log(`Fetched ${data?.length || 0} students from database`);

    if (data && data.length > 0) {
      setAllStudents(data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } else {
      console.warn("No students found for this session criteria");
    }
  };

  useEffect(() => {
    if (session) fetchAllStudents();
  }, [session]);

  const handleManualMark = async () => {
    if (!manualStudentId) return;
    
    const student = allStudents.find(s => s.id === manualStudentId);
    
    const { error } = await supabase
      .from("attendance_records")
      .insert({
        session_id: sessionId,
        student_id: manualStudentId
      });

    if (error) {
      if (error.code === '23505') toast.error("Student already marked present");
      else toast.error("Failed to mark student");
    } else {
      toast.success("Student marked present");
      setManualStudentId("");
      
      if (student) {
        setPresentStudents(prev => {
          if (prev.some(p => p.id === student.id)) return prev;
          return [...prev, student];
        });
      }
    }
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
    if (data.status === 'active') {
      const createdAt = new Date(data.created_at).getTime();
      const now = new Date().getTime();
      const oneHour = 60 * 60 * 1000;

      if (now - createdAt > oneHour) {
        data.status = 'completed';
        // Optionally notify the user or update the DB (though backend already handles DB)
      }
    }

    setSession(data);
    setLoading(false);
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
          <Badge className={session?.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}>
            {session?.status === 'active' ? 'Active' : 'Completed'}
          </Badge>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
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

        {/* Manual Marking */}
        {session?.status === 'active' && (
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" />
                Manual Marking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Select value={manualStudentId} onValueChange={setManualStudentId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select student..." />
                </SelectTrigger>
                <SelectContent>
                  {absentStudents
                    .sort((a, b) => a.roll_no.localeCompare(b.roll_no))
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        [{s.roll_no}] {s.name}
                      </SelectItem>
                    ))}
                  {absentStudents.length === 0 && (
                    <div className="p-2 text-sm text-center text-muted-foreground">
                      All students marked
                    </div>
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleManualMark} 
                disabled={!manualStudentId}
                className="w-full h-11"
              >
                Mark Present
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <Card className="bg-card/50">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {session?.status === 'active' ? (
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
                No students marked yet
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
                          <div className="font-medium text-sm">{student.name}</div>
                          <div className="text-xs text-muted-foreground">Roll: {student.roll_no}</div>
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

      <MobileBottomNav />
    </div>
  );
};

export default AttendanceSession;
