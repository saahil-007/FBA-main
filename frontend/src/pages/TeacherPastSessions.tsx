import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Calendar, BookOpen, ChevronRight, Search, Filter, X } from "lucide-react";
import { toast } from "sonner";

import { API_URL } from "@/config";
import { MobileBottomNav } from "@/components/MobileBottomNav";

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
      const response = await fetch(`${API_URL}/sessions`);
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
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-US", {
        month: 'short',
        day: 'numeric'
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: '2-digit',
        minute: '2-digit'
      }),
      full: date.toLocaleDateString("en-US", {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    };
  };

  const clearFilters = () => {
    setDateFilter("");
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border safe-top">
        <div className="flex items-center gap-3 h-14 px-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/teacher/dashboard")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">Past Sessions</h1>
        </div>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search subject, class..." 
            className="pl-10 h-11 bg-card pr-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 bg-card rounded-lg p-2 border border-border shrink-0">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              className="bg-transparent border-none text-sm focus:outline-none"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          {(dateFilter || searchQuery) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="h-9 shrink-0"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          {filteredSessions.length} {filteredSessions.length === 1 ? 'session' : 'sessions'} found
        </div>

        {/* Sessions List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card className="border-dashed bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Filter className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <CardTitle className="text-lg mb-2">No sessions found</CardTitle>
              <CardDescription className="text-sm">
                {searchQuery || dateFilter 
                  ? "Try adjusting your filters" 
                  : "You haven't created any sessions yet"}
              </CardDescription>
              {(searchQuery || dateFilter) && (
                <Button variant="link" onClick={clearFilters} className="mt-2 text-primary">
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const dateInfo = formatDate(session.created_at);
              return (
                <Card 
                  key={session.id} 
                  className="bg-card/50 border-border active:bg-accent/50 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/session/${session.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Date Badge */}
                      <div className="shrink-0 text-center bg-primary/10 rounded-lg p-2 min-w-[60px]">
                        <div className="text-xs text-primary font-semibold uppercase">
                          {dateInfo.date.split(' ')[0]}
                        </div>
                        <div className="text-lg font-bold text-primary">
                          {dateInfo.date.split(' ')[1]}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">
                              {session.subject || "General Session"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {session.branch} • {session.year} • Div {session.division}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {dateInfo.time}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            session.status === 'active' 
                              ? 'bg-green-500/10 text-green-500' 
                              : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {session.status === 'active' ? 'Active' : 'Completed'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
};

export default TeacherPastSessions;
