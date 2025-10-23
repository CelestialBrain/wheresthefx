import { useState } from "react";
import { Search, Calendar, DollarSign, Clock, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface MapFiltersProps {
  onFilterChange: (filters: any) => void;
  onSearchChange: (query: string) => void;
}

export function MapFilters({ onFilterChange, onSearchChange }: MapFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState("all");

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
    <div className="fixed top-0 left-0 right-0 z-[1000] backdrop-blur-md bg-black/60 border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          {/* Search Bar */}
          <div className="relative flex-1 w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events or locations..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 bg-background/50 border-border"
            />
          </div>

          {/* Date Filter */}
          <Select value={selectedDate} onValueChange={handleDateChange}>
            <SelectTrigger className="w-full md:w-[180px] bg-background/50">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Date" />
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
            <SelectTrigger className="w-full md:w-[150px] bg-background/50">
              <DollarSign className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Prices</SelectItem>
              <SelectItem value="free">Free Only</SelectItem>
              <SelectItem value="paid">Paid Events</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
