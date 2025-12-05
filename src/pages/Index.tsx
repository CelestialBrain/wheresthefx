import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MathVerification } from "@/components/MathVerification";
import { EventSidebar } from "@/components/EventSidebar";
import { EventMap } from "@/components/EventMap";
import { MapFilters } from "@/components/MapFilters";
import { UserOnboarding } from "@/components/UserOnboarding";
import { CategoryFilter } from "@/components/CategoryFilter";
import { Button } from "@/components/ui/button";
import { UserCircle } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [isVerified, setIsVerified] = useState(false);
  const [isMapUnlocked, setIsMapUnlocked] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { hasCompletedOnboarding } = useUserPreferences();

  useEffect(() => {
    // Check if already verified in session
    const hasVerified = sessionStorage.getItem('age_verified') === 'true';
    if (hasVerified) {
      setIsVerified(true);
      setIsMapUnlocked(true);
    }

    // Check authentication status and skip verification for authenticated users
    supabase.auth.getUser().then(({ data: { user } }) => {
      const authenticated = !!user;
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        // Skip age verification for authenticated users
        sessionStorage.setItem('age_verified', 'true');
        setIsVerified(true);
        setIsMapUnlocked(true);
      }
    });

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const authenticated = !!session?.user;
      setIsAuthenticated(authenticated);
      
      if (authenticated && !isMapUnlocked) {
        sessionStorage.setItem('age_verified', 'true');
        setIsVerified(true);
        setIsMapUnlocked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Show onboarding for authenticated users who haven't completed it
    if (isMapUnlocked && isAuthenticated && hasCompletedOnboarding === false) {
      setShowOnboarding(true);
    }
  }, [isMapUnlocked, isAuthenticated, hasCompletedOnboarding]);

  const handleVerified = () => {
    sessionStorage.setItem('age_verified', 'true');
    setIsVerified(true);
    // Start fade-out transition
    setTimeout(() => {
      setIsMapUnlocked(true);
    }, 1000); // Match transition duration
  };

  const handleOnboardingComplete = (selectedTags: string[]) => {
    setShowOnboarding(false);
    // Apply tag filters to the map
    setFilters((prev: any) => ({ ...prev, interestTags: selectedTags }));
  };

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${isMapUnlocked ? 'bg-black' : 'bg-background'}`}>
      {/* White overlay with math verification - fades out after verification */}
      <div 
        className={`fixed inset-0 z-50 bg-white transition-opacity duration-1000 flex ${
          isVerified ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
          {/* Background f(x) */}
          <div className="absolute bottom-0 right-0 pointer-events-none select-none translate-x-1/4 translate-y-1/4 z-0">
            <span className="math-function text-[40rem] text-muted-foreground/20 leading-none">
              f(x)
            </span>
          </div>
          
          {/* Header */}
          <header className="absolute top-6 right-6">
            {isAuthenticated ? (
              <Button 
                className="frosted-glass-purple"
                size="sm" 
                onClick={() => navigate("/auth")}
              >
                <UserCircle className="h-4 w-4 mr-2" />
                Account
              </Button>
            ) : (
              <Button 
                className="frosted-glass-purple"
                size="sm" 
                onClick={() => navigate("/auth")}
              >
                <UserCircle className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
          </header>

          {/* Hero Section */}
          <div className="max-w-3xl w-full space-y-12 z-10">
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
            <MathVerification onVerified={handleVerified} />
          </div>

          {/* Footer */}
          <footer className="absolute bottom-6 text-xs text-muted-foreground">
            Currently serving Quezon City • More cities coming soon
          </footer>
        </div>

        {/* Sidebar - Desktop Only */}
        <div className="hidden lg:block">
          <EventSidebar />
        </div>
      </div>

      {/* Map (always rendered, revealed after fade) */}
      <div className={`h-screen transition-opacity duration-1000 ${isMapUnlocked ? 'opacity-100' : 'opacity-0'}`}>
        <MapFilters onFilterChange={setFilters} onSearchChange={setSearchQuery} />
        {/* Category filter chips - Instagram Stories style */}
        <div className="fixed top-16 left-0 right-0 z-30">
          <CategoryFilter 
            activeCategory={selectedCategory} 
            onCategoryChange={(cat) => {
              setSelectedCategory(cat);
              setFilters((prev: any) => ({ ...prev, category: cat }));
            }} 
          />
        </div>
        <EventMap filters={{ ...filters, category: selectedCategory }} searchQuery={searchQuery} />
        <UserOnboarding open={showOnboarding} onComplete={handleOnboardingComplete} />
      </div>
    </div>
  );
};

export default Index;
