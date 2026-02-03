import { useLocation, useNavigate } from "react-router-dom";
import { Home, Camera, Clock, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  activePaths?: string[];
}

const navItems: NavItem[] = [
  {
    icon: Home,
    label: "Dashboard",
    path: "/teacher/dashboard",
    activePaths: ["/teacher/dashboard"]
  },
  {
    icon: PlusCircle,
    label: "New Session",
    path: "/teacher/new-attendance",
    activePaths: ["/teacher/new-attendance"]
  },
  {
    icon: Clock,
    label: "History",
    path: "/teacher/past-sessions",
    activePaths: ["/teacher/past-sessions", "/session/"]
  }
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item: NavItem) => {
    if (item.activePaths) {
      return item.activePaths.some(path => location.pathname.startsWith(path));
    }
    return location.pathname === item.path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-bottom lg:hidden xl:hidden 2xl:hidden">
      <div className="flex items-center justify-around h-16 pb-safe">
        {navItems.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200",
                "min-h-[44px] touch-manipulation",
                active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all duration-200",
                active && "bg-primary/10"
              )}>
                <Icon className={cn(
                  "w-5 h-5 transition-all duration-200",
                  active && "scale-110"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all duration-200",
                active && "font-semibold"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
