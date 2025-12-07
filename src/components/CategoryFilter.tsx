import { ALL_CATEGORIES } from '@/constants/categoryColors';

interface CategoryFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryFilter({ activeCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide">
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onCategoryChange(cat.id)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeCategory === cat.id
              ? 'bg-white text-black shadow-md'
              : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
          }`}
        >
          {/* Colored pixel dot */}
          <span 
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
            aria-hidden="true"
          />
          {cat.label}
        </button>
      ))}
    </div>
  );
}
