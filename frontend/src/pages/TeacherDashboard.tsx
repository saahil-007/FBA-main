import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, User, Camera, History, Users, CheckCircle, Activity } from "lucide-react";
import { toast } from "sonner";

const TeacherDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalAttendance: 0,
    activeSessions: 0,
  });
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
    fetchStats();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/login");
    } else {
      setUser(user);
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        { count: sessionsCount },
        { count: attendanceCount },
        { data: recentData }
      ] = await Promise.all([
        supabase.from("sessions").select("*", { count: 'exact', head: true }).eq("teacher_id", user.id),
        supabase.from("attendance_records").select("*, sessions!inner(teacher_id)", { count: 'exact', head: true }).eq("sessions.teacher_id", user.id),
        supabase.from("sessions").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(3)
      ]);

      setStats({
        totalSessions: sessionsCount || 0,
        totalAttendance: attendanceCount || 0,
        activeSessions: recentData?.filter(s => s.status === 'active').length || 0
      });
      setRecentSessions(recentData || []);
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load dashboard insights");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-poppins">FBA</h1>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Teacher</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{user?.email}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="px-2 sm:px-3">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h2>
          <p className="text-muted-foreground">Welcome back! Manage your attendance sessions and view insights.</p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Button 
            className="h-32 text-xl gap-4 bg-primary hover:bg-primary/90 shadow-lg"
            onClick={() => navigate("/teacher/new-attendance")}
          >
            <Camera className="w-8 h-8" />
            <div className="text-left">
              <div className="font-bold">Take Attendance</div>
              <div className="text-sm font-normal opacity-80">Start a new facial recognition session</div>
            </div>
          </Button>

          <Button 
            variant="outline"
            className="h-32 text-xl gap-4 border-2 hover:bg-accent shadow-sm"
            onClick={() => navigate("/teacher/past-sessions")}
          >
            <History className="w-8 h-8 text-primary" />
            <div className="text-left">
              <div className="font-bold">View Past Records</div>
              <div className="text-sm font-normal text-muted-foreground">Review and export previous attendance</div>
            </div>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Students Marked</CardTitle>
              <Users className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAttendance}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Sessions</CardTitle>
              <CheckCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeSessions}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>Your last 3 attendance sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No sessions found</div>
            ) : (
              <div className="space-y-4">
                {recentSessions.map((session) => (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/session/${session.id}`)}
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{session.subject || "General Session"}</div>
                      <div className="text-sm text-muted-foreground">
                        {session.branch} • {session.year} • Div {session.division}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{new Date(session.created_at).toLocaleDateString()}</div>
                      <div className={`text-xs ${session.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TeacherDashboard;
