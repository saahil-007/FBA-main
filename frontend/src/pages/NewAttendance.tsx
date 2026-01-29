import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, LogOut, User, ArrowLeft } from "lucide-react";

const NewAttendance = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  // Data from Supabase
  const [branches, setBranches] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    branch: "",
    year: "",
    division: "",
    subject: "",
    classroom: "",
    startTime: "",
    duration: "1",
  });

  useEffect(() => {
    checkUser();
    fetchData();
  }, []);

  // Update duration based on subject code
  useEffect(() => {
    if (formData.subject) {
      const selectedSubject = subjects.find(s => s.code === formData.subject);
      if (selectedSubject && selectedSubject.code.startsWith("CSL")) {
        setFormData(prev => ({ ...prev, duration: "2" }));
      } else {
        setFormData(prev => ({ ...prev, duration: "1" }));
      }
    }
  }, [formData.subject, subjects]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/login");
    } else {
      setUser(user);
    }
  };

  const fetchData = async () => {
    try {
      const [
        { data: branchesData },
        { data: yearsData },
        { data: divisionsData },
        { data: subjectsData }
      ] = await Promise.all([
        supabase.from("branches").select("*"),
        supabase.from("academic_years").select("*"),
        supabase.from("divisions").select("*"),
        supabase.from("subjects").select("*")
      ]);

      setBranches(branchesData || []);
      setYears(yearsData || []);
      setDivisions(divisionsData || []);
      setSubjects(subjectsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load session configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branch || !formData.year || !formData.division || !formData.subject || !formData.classroom || !formData.startTime) {
      toast.error("Please fill all fields");
      return;
    }

    setSubmitting(true);
    try {
      // Calculate end time
      const [hours, minutes] = formData.startTime.split(':').map(Number);
      const endHours = (hours + parseInt(formData.duration)) % 24;
      const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      const selectedSubject = subjects.find(s => s.code === formData.subject);

      const { data, error } = await supabase.from("sessions").insert({
        teacher_id: user.id,
        branch: formData.branch,
        year: formData.year,
        division: formData.division,
        subject: selectedSubject?.name || formData.subject,
        class_name: formData.classroom,
        start_time: formData.startTime,
        end_time: endTime,
        status: 'active'
      }).select().single();

      if (error) throw error;

      // Call backend to pre-load embeddings
      try {
        await fetch(`http://localhost:8000/load-session-embeddings/${data.id}`, { method: 'POST' });
      } catch (beError) {
        console.error("Backend pre-load failed:", beError);
      }

      toast.success("Session created successfully");
      navigate(`/teacher/new-attendance/${data.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create session");
    } finally {
      setSubmitting(false);
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">Configure New Session</h2>
        </div>

        <Card className="border-border bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle>Class Details</CardTitle>
            <CardDescription>Select the class details to begin marking attendance.</CardDescription>
          </CardHeader>
          <form onSubmit={handleCreateSession}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Branch */}
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select onValueChange={(v) => setFormData({...formData, branch: v})}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Year */}
                <div className="space-y-2">
                  <Label>Academic Year</Label>
                  <Select onValueChange={(v) => setFormData({...formData, year: v})}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y.name} value={y.name}>{y.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Division */}
                <div className="space-y-2">
                  <Label>Division</Label>
                  <Select onValueChange={(v) => setFormData({...formData, division: v})}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Division" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisions.map(d => (
                        <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select onValueChange={(v) => setFormData({...formData, subject: v})}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => (
                        <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Time */}
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <input
                    type="time"
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    required
                  />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <Label>Duration (Hours)</Label>
                  <Select 
                    value={formData.duration} 
                    onValueChange={(v) => setFormData({...formData, duration: v})}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Hour</SelectItem>
                      <SelectItem value="2">2 Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Classroom */}
              <div className="space-y-2">
                <Label>Classroom / Room No. (201-1110)</Label>
                <Input
                  type="number"
                  placeholder="Enter Room No."
                  min="201"
                  max="1110"
                  className="bg-background border-border"
                  value={formData.classroom}
                  onChange={(e) => setFormData({...formData, classroom: e.target.value})}
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full h-12 text-base" disabled={submitting}>
                {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                Create Attendance Session
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
};

export default NewAttendance;
