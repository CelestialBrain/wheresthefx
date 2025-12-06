import { MapPin, HelpCircle, Lock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type LocationStatus = 'confirmed' | 'tba' | 'secret' | 'dm_for_details';

interface LocationDisplayProps {
  locationName: string | null;
  locationStatus: LocationStatus | null | undefined;
  instagramHandle?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function LocationDisplay({ 
  locationName, 
  locationStatus, 
  instagramHandle,
  latitude,
  longitude 
}: LocationDisplayProps) {
  const status = locationStatus ?? 'confirmed';

  switch (status) {
    case 'tba':
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <HelpCircle className="h-4 w-4 text-amber-500" />
          <span className="italic">Location TBA</span>
          <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded">
            Check back later
          </span>
        </div>
      );

    case 'secret':
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4 text-purple-500" />
          <span className="italic">Secret Location</span>
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded cursor-help">
                🤫 Revealed to attendees
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Location will be shared after registration/RSVP
            </TooltipContent>
          </Tooltip>
        </div>
      );

    case 'dm_for_details':
      return (
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-500" />
          <span className="text-muted-foreground italic">DM for address</span>
          {instagramHandle && (
            <Button 
              variant="outline" 
              size="sm"
              className="h-6 text-xs"
              onClick={() => window.open(`https://instagram.com/${instagramHandle.replace('@', '')}`, '_blank')}
            >
              Message @{instagramHandle.replace('@', '')}
            </Button>
          )}
        </div>
      );

    case 'confirmed':
    default:
      if (!locationName) {
        return (
          <span className="text-muted-foreground italic">Location not specified</span>
        );
      }
      
      return (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">{locationName}</span>
          {latitude && longitude && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => window.open(
                `https://www.google.com/maps?q=${latitude},${longitude}`,
                '_blank'
              )}
            >
              View Map →
            </Button>
          )}
        </div>
      );
  }
}
