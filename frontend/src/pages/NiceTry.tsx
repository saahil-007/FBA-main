import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Users } from "lucide-react";

const NiceTry = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('sessionId');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full border-destructive/20 bg-destructive/5">
        <CardHeader className="text-center">
          <div className="mx-auto bg-destructive/10 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4">
            <ShieldAlert className="w-10 h-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            Nice Try! 😏
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <div className="space-y-2">
            <p className="text-lg font-medium text-foreground">
              Proxy na lagti bete!
            </p>
            <p className="text-muted-foreground">
              Rehn de, sir bhi dekh rahe hai aur mai bhi.
            </p>
          </div>
          
          <div className="pt-4">
            <Button 
              className="w-full gap-2" 
              variant="outline"
              onClick={() => sessionId ? navigate(`/student/view/${sessionId}`) : navigate('/')}
            >
              <Users className="w-4 h-4" />
              View Attendance List
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NiceTry;
