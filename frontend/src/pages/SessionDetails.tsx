import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, FileText, Table as TableIcon, Users, CheckCircle2, Link as LinkIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

import { API_URL } from "@/config";

const SessionDetails = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
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
      // Fetch session info from Supabase directly for speed
      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      
      if (sessionError) throw sessionError;
      setSession(sessionData);

      // Fetch attendance from our backend API
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
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading session details...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold mb-4">Session Not Found</h2>
        <Button onClick={() => navigate("/past-sessions")}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/past-sessions")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{session.subject || "General Session"}</h1>
              <p className="text-muted-foreground text-sm">
                {session.branch} • {session.year} • Div {session.division}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 sm:flex-none"
              onClick={() => handleExport('csv')}
              disabled={exporting !== null}
            >
              {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TableIcon className="h-4 w-4 mr-2" />}
              Export CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 sm:flex-none"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
            >
              {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Export PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{session.status}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{new Date(session.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{new Date(session.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between py-2 pt-4">
                <span className="text-lg font-bold">Total Present</span>
                <span className="text-2xl font-bold text-primary">{attendance.length}</span>
              </div>
              <div className="pt-4 flex gap-2">
                <a 
                  href={getShareUrl(`/student/view/${sessionId}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 text-xs gap-2"
                  title="Open in new tab / Right-click for options"
                >
                  <LinkIcon className="h-4 w-4" /> Open Student View
                </a>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => copyToClipboard(`/student/view/${sessionId}`)}
                  title="Copy link"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Attendance List
              </CardTitle>
              <CardDescription>
                List of students who marked their attendance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No attendance records found for this session.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Roll No</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Marked At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((record) => (
                        <TableRow key={record.student_id}>
                          <TableCell className="font-medium">{record.roll_no}</TableCell>
                          <TableCell>{record.name}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {new Date(record.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SessionDetails;
