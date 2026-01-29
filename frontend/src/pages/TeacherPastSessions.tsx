import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Calendar, Users, BookOpen, ChevronRight, Search, Filter } from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = "http://localhost:8000";

const TeacherPastSessions = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [sessions, dateFilter, searchQuery]);

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      const data = await response.json();
      setSessions(data);
      setFilteredSessions(data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      toast.error("Failed to load past sessions");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...sessions];

    if (dateFilter) {
      result = result.filter(session => 
        session.created_at.startsWith(dateFilter)
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(session => 
        (session.subject?.toLowerCase().includes(query)) ||
        (session.branch?.toLowerCase().includes(query)) ||
        (session.year?.toLowerCase().includes(query)) ||
        (session.division?.toLowerCase().includes(query))
      );
    }

    setFilteredSessions(result);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clearFilters = () => {
    setDateFilter("");
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Past Sessions</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search subject, class..." 
                className="pl-9 bg-card"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Date Filter Bar */}
        <Card className="bg-card/50 backdrop-blur-sm border-primary/10">
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Calendar className="h-4 w-4 text-primary" />
              <Input 
                type="date" 
                className="bg-background border-border"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearFilters}
              disabled={!dateFilter && !searchQuery}
            >
              Clear Filters
            </Button>
            <div className="text-sm text-muted-foreground ml-auto">
              Found {filteredSessions.length} sessions
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Filter className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <CardTitle className="text-xl">No sessions match your criteria</CardTitle>
              <CardDescription>
                Try adjusting your search or date filter.
              </CardDescription>
              <Button variant="link" onClick={clearFilters} className="mt-2 text-primary">
                View All Sessions
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredSessions.map((session) => (
              <Card 
                key={session.id} 
                className="group cursor-pointer hover:border-primary transition-all hover:shadow-md bg-card/40"
                onClick={() => navigate(`/session/${session.id}`)}
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <CardTitle className="text-lg">{session.subject || "General Session"}</CardTitle>
                      </div>
                      <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(session.created_at)}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-primary/80">
                          {session.branch} • {session.year} • Div {session.division}
                        </span>
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherPastSessions;
