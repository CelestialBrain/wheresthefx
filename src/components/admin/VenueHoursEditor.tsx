import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock } from "lucide-react";

interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

interface OperatingHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
  notes?: string;
  [key: string]: DayHours | string | undefined;
}

interface VenueHoursEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueName: string;
  currentHours: OperatingHours | null;
  onSave: (hours: OperatingHours) => void;
  isSaving?: boolean;
}

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

export const VenueHoursEditor = ({
  open,
  onOpenChange,
  venueName,
  currentHours,
  onSave,
  isSaving = false,
}: VenueHoursEditorProps) => {
  const [hours, setHours] = useState<OperatingHours>(currentHours || {});
  const [notes, setNotes] = useState(currentHours?.notes || "");

  const updateDayHours = (day: string, field: "open" | "close" | "closed", value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day as keyof OperatingHours] as DayHours,
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    const cleanedHours: OperatingHours = { ...hours };
    if (notes.trim()) {
      cleanedHours.notes = notes.trim();
    }
    onSave(cleanedHours);
  };

  const applyToWeekdays = (day: string) => {
    const sourceHours = hours[day as keyof OperatingHours] as DayHours;
    if (!sourceHours) return;
    
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const updated = { ...hours };
    weekdays.forEach((d) => {
      updated[d as keyof OperatingHours] = { ...sourceHours };
    });
    setHours(updated);
  };

  const applyToWeekends = (day: string) => {
    const sourceHours = hours[day as keyof OperatingHours] as DayHours;
    if (!sourceHours) return;
    
    const weekends = ["saturday", "sunday"];
    const updated = { ...hours };
    weekends.forEach((d) => {
      updated[d as keyof OperatingHours] = { ...sourceHours };
    });
    setHours(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Operating Hours: {venueName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {DAYS.map(({ key, label }) => {
            const dayHours = (hours[key as keyof OperatingHours] as DayHours) || {};
            const isClosed = dayHours.closed === true;

            return (
              <div key={key} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
                <div className="w-24 font-medium text-sm">{label}</div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!isClosed}
                    onCheckedChange={(checked) => updateDayHours(key, "closed", !checked)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {isClosed ? "Closed" : "Open"}
                  </span>
                </div>

                {!isClosed && (
                  <>
                    <Input
                      type="time"
                      value={dayHours.open || ""}
                      onChange={(e) => updateDayHours(key, "open", e.target.value)}
                      className="w-28 h-8 text-sm"
                      placeholder="Open"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={dayHours.close || ""}
                      onChange={(e) => updateDayHours(key, "close", e.target.value)}
                      className="w-28 h-8 text-sm"
                      placeholder="Close"
                    />
                  </>
                )}

                <div className="flex gap-1 ml-auto">
                  {key === "monday" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => applyToWeekdays(key)}
                    >
                      →Weekdays
                    </Button>
                  )}
                  {key === "saturday" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => applyToWeekends(key)}
                    >
                      →Weekend
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Extended hours on holidays, Last order 30 min before close"
              className="mt-1"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Hours"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
