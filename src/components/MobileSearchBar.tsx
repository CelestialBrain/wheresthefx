import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
}

export function MobileSearchBar({ isOpen, onClose, value, onChange }: MobileSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="w-full animate-slide-in-from-top">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1 h-10 rounded-md frosted-glass-button">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70 pointer-events-none z-20" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search events, places, or accounts..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full bg-transparent pl-9 pr-4 text-sm text-white placeholder:text-white/60 focus:outline-none appearance-none"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <Button
          size="icon"
          onClick={onClose}
          className="frosted-glass-button backdrop-blur-xl bg-white/15 dark:bg-black/40 shadow-none h-10 w-10 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
