import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import TeacherDashboard from "./pages/TeacherDashboard";
import NewAttendance from "./pages/NewAttendance";
import AttendanceSession from "./pages/AttendanceSession";
import CameraRecognition from "./pages/CameraRecognition";
import TeacherPastSessions from "./pages/TeacherPastSessions";
import SessionDetails from "./pages/SessionDetails";
import StudentListView from "./pages/StudentListView";
import NotFound from "./pages/NotFound";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/login" />;

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          <Route path="/teacher/dashboard" element={
            <ProtectedRoute>
              <TeacherDashboard />
            </ProtectedRoute>
          } />

          <Route path="/teacher/new-attendance" element={
            <ProtectedRoute>
              <NewAttendance />
            </ProtectedRoute>
          } />
          
          <Route path="/teacher/new-attendance/:sessionId" element={
            <ProtectedRoute>
              <AttendanceSession />
            </ProtectedRoute>
          } />

          <Route path="/student/camera/:sessionId" element={<CameraRecognition />} />
          <Route path="/student/view/:sessionId" element={<StudentListView />} />
          
          <Route path="/teacher/past-sessions" element={
            <ProtectedRoute>
              <TeacherPastSessions />
            </ProtectedRoute>
          } />
          
          <Route path="/session/:sessionId" element={
            <ProtectedRoute>
              <SessionDetails />
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={<Navigate to="/teacher/dashboard" replace />} />
          <Route path="/past-sessions" element={<Navigate to="/teacher/past-sessions" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
