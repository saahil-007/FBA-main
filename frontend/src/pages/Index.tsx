import { Link } from "react-router-dom";
import NeuralBackground from "@/components/ui/flow-field-background";
import { Button } from "@/components/ui/button";
import { Clock, Shield, Zap, Users, BarChart3 } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <NeuralBackground
          color="#8b5cf6"
          trailOpacity={0.08}
          particleCount={400}
          speed={0.6}
          className="absolute inset-0"
        />
        
        {/* Content */}
        <div className="relative z-10 px-6 text-center max-w-lg mx-auto">
          <h1 className="text-6xl font-bold mb-6 leading-tight font-poppins">
            FBA
          </h1>
          
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Seamless check-ins powered by AI. No cards, no codes — just your face.
          </p>

          <div className="flex flex-col gap-4">
            <Link to="/signup">
              <Button size="lg" className="w-full text-base py-6">
                Get Started Free
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg" className="w-full text-base py-6 bg-secondary/50 border-border hover:bg-secondary">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">
            Why Choose FBA?
          </h2>

          <div className="space-y-6">
            {[
              { icon: Zap, title: "Instant Recognition", desc: "Check in within seconds with AI-powered facial recognition" },
              { icon: Shield, title: "Secure & Private", desc: "Your biometric data is encrypted and never shared" },
              { icon: Clock, title: "Real-time Tracking", desc: "Monitor attendance live across all locations" },
              { icon: Users, title: "Team Management", desc: "Organize employees into departments and groups" },
              { icon: BarChart3, title: "Analytics Dashboard", desc: "Insights and reports at your fingertips" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-4 rounded-xl bg-card border border-border">
                <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Transform Attendance?</h2>
          <p className="text-muted-foreground mb-8">
            Join thousands of companies using FBA for effortless attendance management.
          </p>
          <Link to="/signup">
            <Button size="lg" className="w-full sm:w-auto px-12 py-6 text-base">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-lg mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>© 2024 FBA</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
