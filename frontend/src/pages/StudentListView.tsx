import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const StudentListView = () => {
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);

  useEffect(() => {
    fetchSessionDetails();
    fetchPresentStudents();
    
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
        () => {
          fetchPresentStudents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

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
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 mt-2">
            LIVE ATTENDANCE
          </Badge>
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
