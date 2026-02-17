import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Users, FileText, Table as TableIcon, Camera, PartyPopper } from "lucide-react";

import { API_URL } from "@/config";

const StudentListView = () => {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const justMarked = searchParams.get('marked') === 'true';
  const studentName = searchParams.get('name');
  const rollNumber = searchParams.get('roll');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);

  useEffect(() => {
    fetchSessionDetails();
    
    // Show success toast when coming from successful attendance marking
    if (justMarked && studentName) {
      toast.success(`Your attendance has been marked, ${studentName}!`, {
        duration: 5000,
        icon: <PartyPopper className="w-4 h-4" />
      });
    }
  }, [sessionId, justMarked, studentName]);

  useEffect(() => {
    if (session) {
      fetchAllStudents();
      fetchPresentStudents();
    }
  }, [session]);

  useEffect(() => {
    if (!sessionId || allStudents.length === 0) return;

    const channel = supabase
      .channel(`student-view-${sessionId}`)
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
    
    const { data, error } = await supabase
      .from("students")
      .select("id, name, roll_no")
      .ilike("branch", session.branch)
      .ilike("year", session.year)
      .ilike("division", session.division);
      
    if (error) {
      console.error("Error fetching students:", error);
      return;
    }

    if (data) {
      setAllStudents(data);
    }
  };

  const fetchSessionDetails = async () => {
    try {
      // Ensure backend validates session (auto-closes if expired)
      await fetch(`${API_URL}/sessions/${sessionId}/check-access`).catch(err => console.warn("Backend check skipped", err));
    } catch (e) {
      // Ignore errors, proceed with Supabase fetch
    }

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (data) {
      // Check if session is older than 1 hour and still active
      if (data.status === 'active') {
        const createdAt = new Date(data.created_at).getTime();
        const now = new Date().getTime();
        const oneHour = 60 * 60 * 1000;

        if (now - createdAt > oneHour) {
          data.status = 'completed';
        }
      }
      setSession(data);
    }
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
      setPresentStudents(formatted);
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (session?.status !== 'completed') {
      toast.error("Export is only available after the session has ended.");
      return;
    }

    try {
      setExporting(format);
      const response = await fetch(`${API_URL}/sessions/${sessionId}/export/${format}`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_Session_${session.subject}_${new Date().toISOString().split('T')[0]}.${format}`;
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

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <h1 className="text-xl font-bold">Session not found or expired.</h1>
      </div>
    );
  }

  const absentStudents = allStudents.filter(
    s => !presentStudents.some(p => p.id === s.id)
  );

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{session.subject}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {session.branch} • {session.year} • Div {session.division}
            </p>
          </div>
          <Badge className={session.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}>
            {session.status === 'active' ? 'Live' : 'Completed'}
          </Badge>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Success Message - Only shown when coming from successful capture */}
        {justMarked && (
          <Card className="bg-green-500/10 border-green-500/30 border-2">
            <CardContent className="p-6 text-center">
              <PartyPopper className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-green-600 mb-1">
                Attendance Marked Successfully!
              </h3>
              <p className="text-green-700">
                Welcome, <span className="font-semibold">{studentName || 'Student'}</span>!
              </p>
              <p className="text-sm text-green-600/80 mt-1">
                Roll Number: {rollNumber || 'N/A'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Session Info */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold font-poppins">{session.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(session.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        {session.status === 'active' && (
          <Button 
            className="w-full h-12 gap-2" 
            onClick={() => window.open(`/student/camera/${sessionId}`, '_blank')}
          >
            <Camera className="w-5 h-5" />
            Open Camera to Mark Attendance
          </Button>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{presentStudents.length}</div>
              <div className="text-[10px] text-green-500/80">Present</div>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/10 border-orange-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-500">{absentStudents.length}</div>
              <div className="text-[10px] text-orange-500/80">Absent</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{allStudents.length}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">
                {allStudents.length > 0 ? Math.round((presentStudents.length / allStudents.length) * 100) : 0}%
              </div>
              <div className="text-[10px] text-blue-500/80">Att.</div>
            </CardContent>
          </Card>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className={`flex-1 h-10 text-xs gap-2 ${session.status !== 'completed' ? 'opacity-50' : ''}`}
            onClick={() => handleExport('csv')}
            disabled={session.status !== 'completed' || exporting !== null}
          >
            {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableIcon className="h-4 w-4" />}
            CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className={`flex-1 h-10 text-xs gap-2 ${session.status !== 'completed' ? 'opacity-50' : ''}`}
            onClick={() => handleExport('pdf')}
            disabled={session.status !== 'completed' || exporting !== null}
          >
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            PDF
          </Button>
        </div>

        {session.status !== 'completed' && (
          <p className="text-[10px] text-muted-foreground text-center italic">
            * Export will be enabled after teacher ends the session
          </p>
        )}

        {/* Present Students */}
        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Present List
              </div>
              <span className="text-sm font-normal text-muted-foreground">
                {presentStudents.length}/{allStudents.length}
              </span>
            </CardTitle>
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
                          <div className="font-bold text-sm text-primary">Roll: {student.roll_no}</div>
                          <div className="text-xs text-muted-foreground">{student.name}</div>
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

        <p className="text-center text-xs text-muted-foreground">
          List updates automatically in real-time
        </p>
      </main>
    </div>
  );
};

export default StudentListView;
