import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, User, Camera, History, Users, CheckCircle, Activity, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/MobileBottomNav";

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
        supabase.from("sessions").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(5)
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Mobile-Optimized Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold font-poppins">FBA</h1>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              Teacher
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="h-9 w-9"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Welcome Section */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {user?.email?.split('@')[0] || 'Welcome back'}
          </p>
        </div>

        {/* Quick Actions - Large Touch-Friendly Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            className="h-24 flex-col gap-2 bg-primary hover:bg-primary/90 shadow-lg rounded-xl"
            onClick={() => navigate("/teacher/new-attendance")}
          >
            <Camera className="w-7 h-7" />
            <div className="text-center">
              <div className="font-semibold text-sm">Take Attendance</div>
              <div className="text-xs opacity-80">New Session</div>
            </div>
          </Button>

          <Button 
            variant="outline"
            className="h-24 flex-col gap-2 border-2 hover:bg-accent rounded-xl"
            onClick={() => navigate("/teacher/past-sessions")}
          >
            <History className="w-7 h-7 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm">Past Sessions</div>
              <div className="text-xs text-muted-foreground">View History</div>
            </div>
          </Button>
        </div>

        {/* Stats Cards - Horizontal Scroll on Mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          <Card className="min-w-[120px] flex-1 bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3 text-primary" />
                Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1 bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3 text-green-500" />
                Students
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{stats.totalAttendance}</div>
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1 bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-yellow-500" />
                Active
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">{stats.activeSessions}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Sessions */}
        <Card className="bg-card/50">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Sessions</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs"
                onClick={() => navigate("/teacher/past-sessions")}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No sessions yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentSessions.slice(0, 5).map((session) => (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-4 hover:bg-accent/30 cursor-pointer transition-colors active:bg-accent/50"
                    onClick={() => navigate(`/session/${session.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {session.subject || "General Session"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {session.branch} • {session.year} • Div {session.division}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        session.status === 'active' 
                          ? 'bg-green-500/10 text-green-500' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {session.status === 'active' ? 'Active' : 'Completed'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
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

export default TeacherDashboard;
