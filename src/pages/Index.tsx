import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MathVerification } from "@/components/MathVerification";
import { EventSidebar } from "@/components/EventSidebar";
import { Button } from "@/components/ui/button";
import { UserCircle } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [isVerified, setIsVerified] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Background f(x) */}
        <div className="absolute bottom-0 right-0 pointer-events-none select-none translate-x-1/4 translate-y-1/4 z-0">
          <span className="math-function text-[40rem] text-muted-foreground/20 leading-none">
            f(x)
          </span>
        </div>
        {/* Header */}
        <header className="absolute top-6 right-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
            <UserCircle className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </header>

        {/* Hero Section */}
        <div className="max-w-3xl w-full space-y-12">
          {/* Logo/Title */}
          <div className="space-y-2">
            <h1 className="text-5xl md:text-7xl font-light tracking-tight">
              Where's the{" "}
              <span className="math-function text-accent">f</span>
              <span className="math-function text-accent">(x)</span>
              <span className="text-muted-foreground">?</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Discover parties, thrift markets, and events in Quezon City
            </p>
          </div>

          {/* Math Verification */}
          {!isVerified ? (
            <MathVerification onVerified={() => setIsVerified(true)} />
          ) : (
            <div className="space-y-6">
              <div className="p-8 border border-border/50 rounded-lg bg-card/50 backdrop-blur-sm">
                <h2 className="text-2xl font-semibold mb-3">Welcome to f(x)</h2>
                <p className="text-muted-foreground mb-6">
                  You're now viewing all the functions happening in Quezon City. Check out the
                  sidebar to find events near you, or browse by category.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm">
                    Parties
                  </Button>
                  <Button variant="outline" size="sm">
                    Thrift Markets
                  </Button>
                  <Button variant="outline" size="sm">
                    Concerts
                  </Button>
                  <Button variant="outline" size="sm">
                    Markets
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  <span className="font-semibold">New here?</span> You can browse all events
                  without an account. Sign up to create your own functions and get personalized
                  recommendations.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="absolute bottom-6 text-xs text-muted-foreground">
          Currently serving Quezon City • More cities coming soon
        </footer>
      </main>

      {/* Sidebar - Desktop Only */}
      <div className="hidden lg:block">
        <EventSidebar />
      </div>
    </div>
  );
};

export default Index;
