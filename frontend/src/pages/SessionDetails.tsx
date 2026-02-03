import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileText, Table as TableIcon, Users, CheckCircle2, Link as LinkIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { MobileBottomNav } from "@/components/MobileBottomNav";

import { API_URL } from "@/config";

const SessionDetails = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchData();
    }
  }, [sessionId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      
      if (sessionError) throw sessionError;
      setSession(sessionData);

      // Fetch total students for this session's class
      const { count, error: countError } = await supabase
        .from("students")
        .select("*", { count: 'exact', head: true })
        .ilike("branch", sessionData.branch)
        .ilike("year", sessionData.year)
        .ilike("division", sessionData.division);
      
      if (!countError && count !== null) {
        setTotalStudents(count);
      }

      const response = await fetch(`${API_URL}/sessions/${sessionId}/attendance`);
      if (!response.ok) throw new Error("Failed to fetch attendance");
      const attendanceData = await response.json();
      setAttendance(attendanceData);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load session details");
    } finally {
      setLoading(false);
    }
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

  const getShareUrl = (path: string) => {
    return `${window.location.origin}${path}`;
  };

  const copyToClipboard = (path: string) => {
    const url = getShareUrl(path);
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <h2 className="text-xl font-bold mb-4">Session Not Found</h2>
        <Button onClick={() => navigate("/teacher/past-sessions")}>Go Back</Button>
      </div>
    );
  }

  const dateInfo = new Date(session.created_at);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center gap-3 h-14 px-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/teacher/past-sessions")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{session.subject || "Session"}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {session.branch} • {session.year} • Div {session.division}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Session Info Card */}
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{session.subject || "General Session"}</h2>
                <p className="text-sm text-muted-foreground">
                  {dateInfo.toLocaleDateString()} • {dateInfo.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
              <Badge className={session.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}>
                {session.status === 'active' ? 'Active' : 'Completed'}
              </Badge>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-background rounded-lg p-2 text-center">
                <div className="text-xl font-bold text-primary">{attendance.length}</div>
                <div className="text-[10px] text-muted-foreground">Present</div>
              </div>
              <div className="bg-background rounded-lg p-2 text-center">
                <div className="text-xl font-bold text-orange-500">
                  {totalStudents > 0 ? Math.max(0, totalStudents - attendance.length) : 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Absent</div>
              </div>
              <div className="bg-background rounded-lg p-2 text-center">
                <div className="text-xl font-bold">{totalStudents}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="bg-background rounded-lg p-2 text-center">
                <div className="text-xl font-bold">
                  {totalStudents > 0 ? Math.round((attendance.length / totalStudents) * 100) : 0}%
                </div>
                <div className="text-[10px] text-muted-foreground">Att.</div>
              </div>
            </div>

            {/* Share & Export */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 h-10 text-xs"
                onClick={() => handleExport('csv')}
                disabled={exporting !== null}
              >
                {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TableIcon className="h-4 w-4 mr-2" />}
                CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 h-10 text-xs"
                onClick={() => handleExport('pdf')}
                disabled={exporting !== null}
              >
                {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="icon"
                className="h-10 w-10"
                onClick={() => copyToClipboard(`/student/view/${sessionId}`)}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Attendance List */}
        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Attendance List
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {attendance.length} students
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attendance.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No attendance records yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {attendance
                  .sort((a, b) => a.roll_no.localeCompare(b.roll_no))
                  .map((record, index) => (
                    <div key={record.student_id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                        <div>
                          <div className="font-bold text-sm text-primary">Roll: {record.roll_no}</div>
                          <div className="text-xs text-muted-foreground">{record.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-green-500 text-xs">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Present</span>
                      </div>
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

export default SessionDetails;
