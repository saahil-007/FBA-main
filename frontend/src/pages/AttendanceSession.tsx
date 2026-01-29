import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Camera, Users, CheckCircle2, QrCode, Share2, LogOut, ArrowLeft, UserCheck, Download, FileText, Table as TableIcon, RefreshCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_BASE_URL = "http://localhost:8000";

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
    
    // Subscribe to attendance records for real-time updates
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
        () => {
          fetchPresentStudents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const fetchAllStudents = async () => {
    if (!session) return;
    const { data } = await supabase
      .from("students")
      .select("id, name, roll_no")
      .eq("branch", session.branch)
      .eq("year", session.year)
      .eq("division", session.division);
    if (data) setAllStudents(data);
  };

  useEffect(() => {
    if (session) fetchAllStudents();
  }, [session]);

  const handleManualMark = async () => {
    if (!manualStudentId) return;
    
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
      fetchPresentStudents();
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
    setSession(data);
    setLoading(false);
  };

  const fetchPresentStudents = async () => {
    const { data, error } = await supabase
      .from("attendance_records")
      .select(`
        student_id,
        students (
          name,
          roll_no
        )
      `)
      .eq("session_id", sessionId);

    if (!error && data) {
      // Flatten the result
      const formatted = data.map((item: any) => ({
        id: item.student_id,
        name: item.students.name,
        roll_no: item.students.roll_no
      }));
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
      // Clear backend cache
      fetch(`http://localhost:8000/clear-session-cache/${sessionId}`, { method: 'POST' }).catch(console.error);
      // Update local state to show exports immediately
      setSession(prev => ({ ...prev, status: 'completed' }));
    }
  };

  const copyToClipboard = (path: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      setExporting(format);
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/export/${format}`);
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="truncate">
              <h1 className="text-sm sm:text-lg font-bold font-poppins truncate">{session.subject}</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{session.branch} • {session.year} • Div {session.division}</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 shrink-0 text-[10px] sm:text-xs">
            {session.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-12 space-y-6 sm:space-y-8">
        {/* Manual Verification Section */}
        <Card className="border-border bg-card/50 backdrop-blur-xl">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Manual Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <select 
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[40px]"
              value={manualStudentId}
              onChange={(e) => setManualStudentId(e.target.value)}
            >
              <option value="">Select Student</option>
              {allStudents
                .filter(s => !presentStudents.some(ps => ps.id === s.id))
                .sort((a,b) => a.roll_no.localeCompare(b.roll_no))
                .map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.roll_no}] {s.name}
                  </option>
                ))}
            </select>
            <Button onClick={handleManualMark} disabled={!manualStudentId} className="h-10 sm:h-auto">
              Mark Present
            </Button>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {session.status !== 'completed' ? (
            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" />
                  Recognition Camera
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Open this on a tablet or phone to start the facial recognition scanner.</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => navigate(`/teacher/camera/${sessionId}`)}>
                    Open Camera
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(`/teacher/camera/${sessionId}`)}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/20 bg-primary/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  Session Completed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">This session has been finished. You can now export the final attendance records.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => handleExport('csv')}>
                    <TableIcon className="w-4 h-4" /> Export CSV
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => handleExport('pdf')}>
                    <FileText className="w-4 h-4" /> Export PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Student View
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Share this link with students to view the live attendance list.</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => navigate(`/student/view/${sessionId}`)}>
                  View List
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`/student/view/${sessionId}`)}>
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Present Students List */}
        <Card className="border-border bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <CardTitle className="text-xl">
                Present Students ({presentStudents.length})
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs gap-2 hover:bg-primary/5"
                  onClick={() => handleExport('csv')}
                  disabled={exporting !== null}
                >
                  {exporting === 'csv' ? <Loader2 className="h-3 w-3 animate-spin" /> : <TableIcon className="h-3 w-3 text-primary" />}
                  CSV
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs gap-2 hover:bg-primary/5"
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                >
                  {exporting === 'pdf' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3 text-primary" />}
                  PDF
                </Button>
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8" 
                onClick={fetchPresentStudents}
                title="Refresh list"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Roll No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presentStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                      No students marked present yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  presentStudents.sort((a,b) => a.roll_no.localeCompare(b.roll_no)).map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.roll_no}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Present</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        </Card>

        {/* Action Footer */}
        {session.status !== 'completed' && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button variant="outline" className="flex-1 h-12" onClick={() => toast.info("Manual verification mode enabled")}>
              Manual Verification
            </Button>
            <Button variant="destructive" className="flex-1 h-12" onClick={endSession}>
              End & Save Session
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default AttendanceSession;
