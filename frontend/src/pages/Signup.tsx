import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NeuralBackground from "@/components/ui/flow-field-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          }
        }
      });

      if (error) throw error;

      toast.success("Account created! Please check your email for verification.");
      navigate("/login");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const passwordRequirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(password), text: "One uppercase letter" },
    { met: /[0-9]/.test(password), text: "One number" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative flex items-center justify-center">
      <NeuralBackground
        color="#8b5cf6"
        trailOpacity={0.06}
        particleCount={300}
        speed={0.4}
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-md px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold mb-2">Create your account</h1>
          <p className="text-muted-foreground">Start your free 14-day trial</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 bg-card border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-card border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-card border-border pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Password requirements */}
            {password && (
              <div className="space-y-1.5 pt-2">
                {passwordRequirements.map(({ met, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${met ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {met && <Check className="w-3 h-3" />}
                    </div>
                    <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full h-12 text-base" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By signing up, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </p>
        </form>

        {/* Login link */}
        <p className="text-center mt-8 text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
