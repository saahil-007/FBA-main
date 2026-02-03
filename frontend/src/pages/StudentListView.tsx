import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Users, FileText, Table as TableIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { API_URL } from "@/config";

const StudentListView = () => {
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);

  useEffect(() => {
    fetchSessionDetails();
  }, [sessionId]);

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
    
    const { data } = await supabase
      .from("students")
      .select("id, name, roll_no")
      .eq("branch", session.branch)
      .eq("year", session.year)
      .eq("division", session.division);
      
    if (data) {
      setAllStudents(data);
    }
  };

  const fetchSessionDetails = async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (data) setSession(data);
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
      const formatted = data.map((item: any) => ({
        id: item.student_id,
        name: item.students.name,
        roll_no: item.students.roll_no
      }));
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold">Session not found or expired.</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold font-poppins">{session.subject}</h1>
          <p className="text-muted-foreground">{session.branch} • {session.year} • Div {session.division}</p>
          <div className="flex flex-col items-center gap-4 mt-2">
            <Badge variant="outline" className={`${session.status === 'completed' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
              {session.status === 'completed' ? 'SESSION COMPLETED' : 'LIVE ATTENDANCE'}
            </Badge>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`gap-2 h-9 border-primary/20 ${session.status !== 'completed' ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-primary/5'}`}
                  onClick={() => handleExport('csv')}
                  disabled={exporting !== null}
                >
                  {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableIcon className="h-4 w-4 text-primary" />}
                  Export CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`gap-2 h-9 border-primary/20 ${session.status !== 'completed' ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-primary/5'}`}
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                >
                  {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-primary" />}
                  Export PDF
                </Button>
              </div>
              {session.status !== 'completed' && (
                <p className="text-[10px] text-muted-foreground italic">
                  * Export will be enabled after teacher ends the session
                </p>
              )}
            </div>
          </div>
        </div>

        <Card className="border-border bg-card/50 backdrop-blur-xl">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                Present List
              </div>
              <span className="text-sm font-normal text-muted-foreground">
                Total: {presentStudents.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px] pl-6">Roll No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presentStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-20 text-muted-foreground">
                      No students marked yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  presentStudents.sort((a,b) => a.roll_no.localeCompare(b.roll_no)).map((student) => (
                    <TableRow key={student.id} className="border-border/50">
                      <TableCell className="font-bold text-primary pl-6">{student.roll_no}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-1 text-green-500">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">Present</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          List updates automatically in real-time.
        </p>
      </div>
    </div>
  );
};

export default StudentListView;
