import { Banknote, Gift, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PriceDisplayProps {
  isFree: boolean;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  priceNotes?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function PriceDisplay({ 
  isFree, 
  price, 
  priceMin, 
  priceMax, 
  priceNotes,
  size = 'md' 
}: PriceDisplayProps) {
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-semibold'
  };

  // FREE event
  if (isFree) {
    return (
      <div className={`flex items-center gap-1.5 text-green-600 ${sizeClasses[size]}`}>
        <Gift className="h-4 w-4" />
        <span className="font-bold">FREE</span>
      </div>
    );
  }

  // Price range (new schema)
  if (priceMin != null && priceMax != null) {
    const hasTiers = priceMin !== priceMax;
    
    return (
      <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`}>
        <Banknote className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">
          {hasTiers ? (
            <>₱{priceMin.toLocaleString()} - ₱{priceMax.toLocaleString()}</>
          ) : (
            <>₱{priceMin.toLocaleString()}</>
          )}
        </span>
        
        {priceNotes && (
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium mb-1">Pricing Details:</p>
              <p className="text-sm whitespace-pre-wrap">{priceNotes}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // Legacy single price fallback
  if (price != null) {
    return (
      <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`}>
        <Banknote className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">₱{price.toLocaleString()}</span>
      </div>
    );
  }

  // No price info
  return (
    <span className="text-muted-foreground italic text-sm">Price TBA</span>
  );
}
