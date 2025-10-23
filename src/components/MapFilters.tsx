import { useState } from "react";
import { Search, Calendar, User, Bookmark, Settings, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MobileSearchBar } from "./MobileSearchBar";
import { useSavedEventsCount } from "@/hooks/useSavedEventsCount";
import { useNavigate } from "react-router-dom";

interface MapFiltersProps {
  onFilterChange: (filters: any) => void;
  onSearchChange: (query: string) => void;
}

export function MapFilters({ onFilterChange, onSearchChange }: MapFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState("all");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { data: savedCount } = useSavedEventsCount();
  const navigate = useNavigate();

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
    onFilterChange({ 
      priceFilter: value,
      dateRange: selectedDate !== "all" ? {} : undefined
    });
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
                className="pl-9 pr-4 h-10 rounded-md frosted-glass-button text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-[280px]"
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
            <Button
              size="icon"
              className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 relative shadow-none"
              onClick={() => navigate('/auth')}
            >
              <User className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 relative shadow-none"
            >
              <Bookmark className="h-4 w-4" />
              {savedCount && savedCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {savedCount}
                </Badge>
              )}
            </Button>

            <Button
              size="icon"
              className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 shadow-none"
            >
              <Settings className="h-4 w-4" />
            </Button>
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
    </div>
  );
}
