import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          placeholder="Search events, places, or accounts..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-9 pr-9 h-10 rounded-md frosted-glass-button text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          autoComplete="off"
        />
        <button
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
