import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, LogOut, ArrowLeft, Camera, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { API_URL } from "@/config";
import { MobileBottomNav } from "@/components/MobileBottomNav";

const DEFAULT_GEOFENCE_RADIUS = 10;

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

  // Mode selection state
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [createdSessionInfo, setCreatedSessionInfo] = useState<any>(null);
  
  // Teacher location state
  const [teacherLocation, setTeacherLocation] = useState<{lat: number, lon: number} | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

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

  // Capture teacher's GPS location
  const captureTeacherLocation = (): Promise<{lat: number, lon: number} | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocationError("Geolocation is not supported by your browser");
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          setTeacherLocation(location);
          setLocationError(null);
          resolve(location);
        },
        (err) => {
          console.error("Geolocation error:", err);
          setLocationError("Unable to get your location. Please enable location permissions.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
      );
    });
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branch || !formData.year || !formData.division || !formData.subject || !formData.classroom || !formData.startTime) {
      toast.error("Please fill all fields");
      return;
    }

    setSubmitting(true);
    setCapturingLocation(true);
    
    try {
      // Capture teacher's location (will be used as geofence center)
      toast.info("Capturing your location...");
      const location = await captureTeacherLocation();
      
      if (!location) {
        toast.error("Location capture failed! Teacher location is required for this session.");
        setSubmitting(false);
        setCapturingLocation(false);
        return;
      } else {
        toast.success(`Location captured: ${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`);
      }

      // Calculate end time
      const [hours, minutes] = formData.startTime.split(':');
      const endHours = (parseInt(hours) + parseInt(formData.duration)) % 24;
      const endTime = `${endHours.toString().padStart(2, '0')}:${minutes}`;

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
        status: 'active',
        teacher_latitude: location?.lat,
        teacher_longitude: location?.lon,
        geofence_radius: DEFAULT_GEOFENCE_RADIUS,
        use_teacher_location: true
      }).select().single();

      if (error) throw error;
      
      // Cache face descriptors in browser for faster processing
      try {
        const { data: studentsData, error: studentsError } = await supabase
          .from("students")
          .select("id, name, roll_no, face_descriptor")
          .eq("branch", formData.branch)
          .eq("year", formData.year)
          .eq("division", formData.division)
          .not("face_descriptor", "is", null);

        if (!studentsError && studentsData) {
          const cacheKey = `descriptors_${formData.branch}_${formData.year}_${formData.division}`;
          localStorage.setItem(cacheKey, JSON.stringify(studentsData));
          console.log(`Cached ${studentsData.length} descriptors for ${cacheKey}`);
        }
      } catch (cacheError) {
        console.error("Failed to cache descriptors:", cacheError);
      }

      // Call backend to pre-load embeddings
      try {
        const beResponse = await fetch(`${API_URL}/load-session-embeddings/${data.id}`, { method: 'POST' });
        if (beResponse.status === 503) {
          const errorData = await beResponse.json();
          const detail = errorData.detail;
          if (typeof detail === 'object') {
            toast.warning(`Backend is still starting: ${detail.init_status}. Please wait a minute before starting the camera.`);
          } else {
            toast.warning("Backend is still initializing. Please wait a minute.");
          }
        }
      } catch (beError) {
        console.error("Backend pre-load failed:", beError);
      }

      toast.success("Session created successfully");
      setCreatedSessionId(data.id);
      setCreatedSessionInfo(data);
      setShowModeSelection(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to create session");
    } finally {
      setSubmitting(false);
      setCapturingLocation(false);
    }
  };

  const handleModeSelection = async (mode: 'teacher' | 'student') => {
    if (!createdSessionId) return;
    
    // Update session with capture mode
    const { error } = await supabase
      .from("sessions")
      .update({ capture_mode: mode })
      .eq("id", createdSessionId);
    
    if (error) {
      toast.error("Failed to set capture mode");
      return;
    }
    
    setShowModeSelection(false);
    
    if (mode === 'teacher') {
      // v1: Handle Yourself mode - teacher captures students
      navigate(`/teacher/new-attendance/v1/${createdSessionId}`);
    } else {
      // v2: Let Students Capture mode - students self-capture
      navigate(`/teacher/new-attendance/v2/${createdSessionId}`);
    }
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
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/teacher/dashboard")}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">New Session</h1>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            className="h-9 w-9"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        <form onSubmit={handleCreateSession} className="space-y-4">
          {/* Class Configuration */}
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Class Configuration</CardTitle>
              <CardDescription className="text-xs">
                Select the class details
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Branch */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Branch</Label>
                  <Select onValueChange={(v) => setFormData({...formData, branch: v})}>
                    <SelectTrigger className="h-11 bg-background border-border text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Year */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Year</Label>
                  <Select onValueChange={(v) => setFormData({...formData, year: v})}>
                    <SelectTrigger className="h-11 bg-background border-border text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y.name} value={y.name}>{y.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Division */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Division</Label>
                  <Select onValueChange={(v) => setFormData({...formData, division: v})}>
                    <SelectTrigger className="h-11 bg-background border-border text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisions.map(d => (
                        <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Classroom */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Room No.</Label>
                  <Input
                    type="number"
                    placeholder="201-1110"
                    min="201"
                    max="1110"
                    className="h-11 bg-background border-border text-sm"
                    value={formData.classroom}
                    onChange={(e) => setFormData({...formData, classroom: e.target.value})}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subject & Time */}
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Subject & Time</CardTitle>
              <CardDescription className="text-xs">
                Configure the session details
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Subject */}
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Select onValueChange={(v) => setFormData({...formData, subject: v})}>
                  <SelectTrigger className="h-11 bg-background border-border text-sm">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {subjects.map(s => (
                      <SelectItem key={s.code} value={s.code} className="text-sm">
                        <span className="font-medium">{s.code}</span>
                        <span className="text-muted-foreground ml-2">{s.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Start Time */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <input
                    type="time"
                    className="flex h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    required
                  />
                </div>

                {/* Duration */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <Select 
                    value={formData.duration} 
                    onValueChange={(v) => setFormData({...formData, duration: v})}
                  >
                    <SelectTrigger className="h-11 bg-background border-border text-sm">
                      <SelectValue placeholder="Duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Hour</SelectItem>
                      <SelectItem value="2">2 Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button 
                type="submit" 
                className="w-full h-12 text-sm font-semibold"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Plus className="w-5 h-5 mr-2" />
                )}
                Create Attendance Session
              </Button>
            </CardFooter>
          </Card>
        </form>
      </main>

      <MobileBottomNav />

      {/* Mode Selection Dialog */}
      <Dialog open={showModeSelection} onOpenChange={setShowModeSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Choose Capture Mode</DialogTitle>
            <DialogDescription className="text-center">
              How would you like to handle attendance?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              onClick={() => handleModeSelection('teacher')}
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 border-2 hover:border-primary hover:bg-primary/5"
            >
              <Camera className="w-8 h-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold text-base">Handle Yourself</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Use your device to capture all students
                </div>
              </div>
            </Button>
            
            <Button
              onClick={() => handleModeSelection('student')}
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 border-2 hover:border-primary hover:bg-primary/5"
            >
              <Users className="w-8 h-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold text-base">Let Students Capture</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Students mark their own attendance via link
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
};

export default NewAttendance;
