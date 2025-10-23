import { useState, useEffect } from "react";
import { Search, Calendar, User, Bookmark, Settings, DollarSign, LogOut, Database, Bug, Info, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileSearchBar } from "./MobileSearchBar";
import { SavedEventsDrawer } from "./SavedEventsDrawer";
import { useSavedEventsCount } from "@/hooks/useSavedEventsCount";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface MapFiltersProps {
  onFilterChange: (filters: any) => void;
  onSearchChange: (query: string) => void;
}

export function MapFilters({ onFilterChange, onSearchChange }: MapFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState("all");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { data: savedCount } = useSavedEventsCount();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearchChange(value);
  };

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    let dateRange;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (value) {
      case "today":
        dateRange = { start: today, end: today };
        break;
      case "week":
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        dateRange = { start: today, end: weekEnd };
        break;
      case "weekend":
        const dayOfWeek = today.getDay();
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
        const friday = new Date(today);
        friday.setDate(friday.getDate() + daysUntilFriday);
        const sunday = new Date(friday);
        sunday.setDate(sunday.getDate() + 2);
        dateRange = { start: friday, end: sunday };
        break;
      case "month":
        const monthEnd = new Date(today);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        dateRange = { start: today, end: monthEnd };
        break;
    }
    
    onFilterChange({ dateRange, priceFilter: selectedPrice });
  };

  const handlePriceChange = (value: string) => {
    setSelectedPrice(value);
    
    let dateRange;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (selectedDate) {
      case "today":
        dateRange = { start: today, end: today };
        break;
      case "week":
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        dateRange = { start: today, end: weekEnd };
        break;
      case "weekend":
        const dayOfWeek = today.getDay();
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
        const friday = new Date(today);
        friday.setDate(friday.getDate() + daysUntilFriday);
        const sunday = new Date(friday);
        sunday.setDate(sunday.getDate() + 2);
        dateRange = { start: friday, end: sunday };
        break;
      case "month":
        const monthEnd = new Date(today);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        dateRange = { start: today, end: monthEnd };
        break;
    }
    
    onFilterChange({ 
      priceFilter: value,
      dateRange
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[1000]">
      <div className="container mx-auto px-4 py-3">
        {/* Desktop and Mobile Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Side - Search and Filters */}
          <div className="flex items-center gap-2">
            {/* Search - Desktop full, Mobile icon */}
            <div className="hidden md:block relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search events, places, or accounts..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 pr-4 h-10 rounded-md frosted-glass-button text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-[280px]"
              />
            </div>
            
            {/* Mobile Search Icon */}
            <Button
              size="icon"
              className="md:hidden frosted-glass-button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* Date Filter */}
            <Select value={selectedDate} onValueChange={handleDateChange}>
              <SelectTrigger className="md:w-[180px] w-10 frosted-glass-button border-0 [&>svg.lucide-chevron-down]:hidden md:[&>svg.lucide-chevron-down]:block">
                <div className="flex items-center gap-2 w-full">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="hidden md:block">
                    <SelectValue placeholder="Date" />
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="weekend">This Weekend</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>

            {/* Price Filter */}
            <Select value={selectedPrice} onValueChange={handlePriceChange}>
              <SelectTrigger className="md:w-[150px] w-10 frosted-glass-button border-0 [&>svg.lucide-chevron-down]:hidden md:[&>svg.lucide-chevron-down]:block">
                <div className="flex items-center gap-2 w-full">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span className="hidden md:block">
                    <SelectValue placeholder="Price" />
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prices</SelectItem>
                <SelectItem value="free">Free Only</SelectItem>
                <SelectItem value="paid">Paid Events</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right Side - User Menu */}
          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 relative shadow-none"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {user.email}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSavedDrawerOpen(true)}>
                    <Bookmark className="h-4 w-4 mr-2" />
                    Saved Events
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Coming soon!")}>
                    <Settings className="h-4 w-4 mr-2" />
                    Account Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="icon"
                className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 relative shadow-none"
                onClick={() => navigate('/auth')}
              >
                <User className="h-4 w-4" />
              </Button>
            )}

            <Button
              size="icon"
              className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 shadow-none"
              onClick={() => setSavedDrawerOpen(true)}
            >
              <Bookmark className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 shadow-none"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => window.open('https://lovable.dev', '_blank')}>
                  <Database className="h-4 w-4 mr-2" />
                  View Backend
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? (
                    <>
                      <Sun className="h-4 w-4 mr-2" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4 mr-2" />
                      Dark Mode
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Use the feedback button to report bugs")}>
                  <Bug className="h-4 w-4 mr-2" />
                  Report a Bug
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Where's the f(x)? - Event Discovery App")}>
                  <Info className="h-4 w-4 mr-2" />
                  About
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Search Bar - Slides down */}
        {mobileSearchOpen && (
          <div className="md:hidden mt-2">
            <MobileSearchBar
              isOpen={mobileSearchOpen}
              onClose={() => setMobileSearchOpen(false)}
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        )}
      </div>

      <SavedEventsDrawer 
        open={savedDrawerOpen} 
        onClose={() => setSavedDrawerOpen(false)} 
      />
    </div>
  );
}
