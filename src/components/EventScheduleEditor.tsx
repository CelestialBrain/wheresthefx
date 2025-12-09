import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Calendar, Clock, Plus, Trash2, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface TimeSlot {
  time: string;       // Start time
  endTime?: string;   // End time
  label?: string;
}

export interface ScheduleDay {
  date: string;
  timeSlots: TimeSlot[];
  venueName?: string;
  venueAddress?: string;
}

interface EventScheduleEditorProps {
  schedule: ScheduleDay[];
  onScheduleChange: (schedule: ScheduleDay[]) => void;
  defaultVenue?: string;
  defaultAddress?: string;
}

export const EventScheduleEditor = ({
  schedule,
  onScheduleChange,
  defaultVenue,
  defaultAddress,
}: EventScheduleEditorProps) => {
  const [isAddingDate, setIsAddingDate] = useState(false);

  const addDate = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Check if date already exists
    if (schedule.some(d => d.date === dateStr)) {
      return;
    }

    const newDay: ScheduleDay = {
      date: dateStr,
      timeSlots: [{ time: "", label: "" }],
    };

    const updated = [...schedule, newDay].sort((a, b) => a.date.localeCompare(b.date));
    onScheduleChange(updated);
    setIsAddingDate(false);
  };

  const removeDate = (dateToRemove: string) => {
    onScheduleChange(schedule.filter(d => d.date !== dateToRemove));
  };

  const addTimeSlot = (dateStr: string) => {
    onScheduleChange(
      schedule.map(day =>
        day.date === dateStr
          ? { ...day, timeSlots: [...day.timeSlots, { time: "", endTime: "", label: "" }] }
          : day
      )
    );
  };

  const removeTimeSlot = (dateStr: string, slotIndex: number) => {
    onScheduleChange(
      schedule.map(day =>
        day.date === dateStr
          ? { ...day, timeSlots: day.timeSlots.filter((_, i) => i !== slotIndex) }
          : day
      )
    );
  };

  const updateTimeSlot = (dateStr: string, slotIndex: number, field: keyof TimeSlot, value: string) => {
    onScheduleChange(
      schedule.map(day =>
        day.date === dateStr
          ? {
              ...day,
              timeSlots: day.timeSlots.map((slot, i) =>
                i === slotIndex ? { ...slot, [field]: value } : slot
              ),
            }
          : day
      )
    );
  };

  const updateDayVenue = (dateStr: string, field: "venueName" | "venueAddress", value: string) => {
    onScheduleChange(
      schedule.map(day =>
        day.date === dateStr ? { ...day, [field]: value } : day
      )
    );
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "EEE, MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  // Get dates already in schedule for disabling in picker
  const scheduledDates = schedule.map(d => parseISO(d.date));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Event Schedule</Label>
        <Popover open={isAddingDate} onOpenChange={setIsAddingDate}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="w-3 h-3" />
              Add Date
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              mode="single"
              selected={undefined}
              onSelect={addDate}
              disabled={(date) => 
                scheduledDates.some(d => d.toDateString() === date.toDateString())
              }
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {schedule.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-md">
          No dates added yet. Click "Add Date" to start.
        </div>
      ) : (
        <div className="space-y-3">
          {schedule.map((day) => (
            <Card key={day.date} className="p-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{formatDateDisplay(day.date)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => removeDate(day.date)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              {/* Time Slots */}
              <div className="space-y-2 ml-6">
                {day.timeSlots.map((slot, slotIndex) => (
                  <div key={slotIndex} className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <Input
                      type="time"
                      className="w-20 h-8 text-xs"
                      value={slot.time}
                      onChange={(e) => updateTimeSlot(day.date, slotIndex, "time", e.target.value)}
                      placeholder="Start"
                    />
                    <span className="text-muted-foreground text-xs">-</span>
                    <Input
                      type="time"
                      className="w-20 h-8 text-xs"
                      value={slot.endTime || ""}
                      onChange={(e) => updateTimeSlot(day.date, slotIndex, "endTime", e.target.value)}
                      placeholder="End"
                    />
                    <Input
                      className="flex-1 h-8 text-xs"
                      value={slot.label || ""}
                      onChange={(e) => updateTimeSlot(day.date, slotIndex, "label", e.target.value)}
                      placeholder="Label (optional)"
                    />
                    {day.timeSlots.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeTimeSlot(day.date, slotIndex)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-muted-foreground"
                  onClick={() => addTimeSlot(day.date)}
                >
                  <Plus className="w-3 h-3" />
                  Add Time Slot
                </Button>
              </div>

              {/* Per-day venue override (collapsed by default) */}
              {(day.venueName || day.venueAddress) && (
                <div className="mt-2 ml-6 space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <Input
                      className="flex-1 h-7 text-xs"
                      value={day.venueName || ""}
                      onChange={(e) => updateDayVenue(day.date, "venueName", e.target.value)}
                      placeholder="Venue name (if different)"
                    />
                  </div>
                </div>
              )}
              
              {/* Show "different venue" toggle if not already showing */}
              {!day.venueName && !day.venueAddress && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-6 mt-1 h-6 text-xs gap-1 text-muted-foreground"
                  onClick={() => updateDayVenue(day.date, "venueName", "")}
                >
                  <MapPin className="w-3 h-3" />
                  Different venue for this day
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {schedule.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {schedule.length} date{schedule.length > 1 ? "s" : ""} · {" "}
          {schedule.reduce((acc, d) => acc + d.timeSlots.length, 0)} time slot{schedule.reduce((acc, d) => acc + d.timeSlots.length, 0) > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};
