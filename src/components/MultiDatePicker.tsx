import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatMultipleDates } from "@/utils/dateUtils";

interface MultiDatePickerProps {
  selectedDates: Date[];
  onDatesChange: (dates: Date[]) => void;
  className?: string;
}

export function MultiDatePicker({ selectedDates, onDatesChange, className }: MultiDatePickerProps) {
  const handleSelect = (dates: Date[] | undefined) => {
    onDatesChange(dates || []);
  };

  const removeDate = (dateToRemove: Date) => {
    onDatesChange(selectedDates.filter(d => d.getTime() !== dateToRemove.getTime()));
  };

  const clearAll = () => {
    onDatesChange([]);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <DayPicker
        mode="multiple"
        selected={selectedDates}
        onSelect={handleSelect}
        className="p-3 pointer-events-auto border rounded-md"
      />
      
      {selectedDates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Selected: {formatMultipleDates(selectedDates)}
            </span>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {selectedDates
              .sort((a, b) => a.getTime() - b.getTime())
              .map((date) => (
                <Badge key={date.getTime()} variant="secondary" className="gap-1">
                  {format(date, "MMM d")}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => removeDate(date)}
                  />
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
