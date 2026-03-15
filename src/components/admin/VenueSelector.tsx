import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useKnownVenues, KnownVenue } from "@/hooks/useKnownVenues";

interface VenueSelectorProps {
  value?: string;
  onSelect: (venue: KnownVenue) => void;
  placeholder?: string;
}

export function VenueSelector({ value, onSelect, placeholder = "Select known venue..." }: VenueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: venues = [], isLoading } = useKnownVenues();

  const filteredVenues = useMemo(() => {
    if (!search) return venues.slice(0, 50); // Show first 50 when no search
    
    const searchLower = search.toLowerCase();
    return venues.filter(venue => {
      const nameMatch = venue.name.toLowerCase().includes(searchLower);
      const addressMatch = venue.address?.toLowerCase().includes(searchLower);
      const cityMatch = venue.city?.toLowerCase().includes(searchLower);
      const aliasMatch = venue.aliases?.some(alias => 
        alias.toLowerCase().includes(searchLower)
      );
      return nameMatch || addressMatch || cityMatch || aliasMatch;
    }).slice(0, 50); // Limit results for performance
  }, [venues, search]);

  const selectedVenue = venues.find(v => v.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {selectedVenue ? (
              <span className="truncate">{selectedVenue.name}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search venues..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading venues..." : "No venue found."}
            </CommandEmpty>
            <CommandGroup heading={`Known Venues (${venues.length} total)`}>
              {filteredVenues.map((venue) => (
                <CommandItem
                  key={venue.id}
                  value={venue.name}
                  onSelect={() => {
                    onSelect(venue);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex flex-col items-start py-2"
                >
                  <div className="flex items-center w-full">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === venue.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-medium">{venue.name}</span>
                    {venue.lat && venue.lng && (
                      <span className="ml-auto text-xs text-green-600">📍</span>
                    )}
                  </div>
                  {venue.address && (
                    <span className="ml-6 text-xs text-muted-foreground truncate w-full">
                      {venue.address}{venue.city ? `, ${venue.city}` : ''}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
