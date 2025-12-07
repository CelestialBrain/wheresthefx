// Category color hex values
export const CATEGORY_COLORS: Record<string, string> = {
  nightlife: '#9B59B6',   // Purple 🟣
  music: '#E74C3C',       // Red 🔴
  art_culture: '#00BCD4', // Cyan 🔵
  markets: '#FF9800',     // Orange 🟠
  food: '#FFEB3B',        // Yellow 🟡
  workshops: '#4CAF50',   // Green 🟢
  community: '#E91E63',   // Pink 🩷
  comedy: '#009688',      // Teal 🩵
  other: '#9E9E9E',       // Gray ⚪
};

// Human-readable labels with emoji
export const CATEGORY_LABELS: Record<string, string> = {
  nightlife: '🟣 Nightlife',
  music: '🔴 Music',
  art_culture: '🔵 Art & Film',
  markets: '🟠 Markets',
  food: '🟡 Food',
  workshops: '🟢 Workshops',
  community: '🩷 Community',
  comedy: '🩵 Comedy',
  other: '⚪ Other',
};

// CSS filter strings to colorize the marker icon
const CATEGORY_FILTERS: Record<string, string> = {
  '#9B59B6': 'brightness(0) saturate(100%) invert(34%) sepia(98%) saturate(4764%) hue-rotate(280deg) brightness(95%) contrast(94%)', // Purple
  '#E74C3C': 'brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)', // Red
  '#00BCD4': 'brightness(0) saturate(100%) invert(70%) sepia(67%) saturate(456%) hue-rotate(140deg) brightness(93%) contrast(101%)', // Cyan
  '#FF9800': 'brightness(0) saturate(100%) invert(58%) sepia(89%) saturate(1095%) hue-rotate(360deg) brightness(100%) contrast(106%)', // Orange
  '#FFEB3B': 'brightness(0) saturate(100%) invert(88%) sepia(62%) saturate(497%) hue-rotate(359deg) brightness(103%) contrast(104%)', // Yellow
  '#4CAF50': 'brightness(0) saturate(100%) invert(55%) sepia(43%) saturate(544%) hue-rotate(93deg) brightness(94%) contrast(92%)', // Green
  '#E91E63': 'brightness(0) saturate(100%) invert(26%) sepia(82%) saturate(2841%) hue-rotate(326deg) brightness(96%) contrast(98%)', // Pink
  '#009688': 'brightness(0) saturate(100%) invert(40%) sepia(52%) saturate(533%) hue-rotate(131deg) brightness(95%) contrast(101%)', // Teal
  '#9E9E9E': 'brightness(0) saturate(100%) invert(70%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)', // Gray
};

// Helper to get CSS filter from category
export function getCategoryFilter(category: string): string {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  return CATEGORY_FILTERS[color] || CATEGORY_FILTERS['#9E9E9E'];
}

// All categories for filter UI - pixel dots instead of emoji
export const ALL_CATEGORIES = [
  { id: 'all', label: 'All', color: '#FFFFFF' },
  { id: 'nightlife', label: 'Nightlife', color: '#9B59B6' },
  { id: 'music', label: 'Music', color: '#E74C3C' },
  { id: 'art_culture', label: 'Art & Film', color: '#00BCD4' },
  { id: 'markets', label: 'Markets', color: '#FF9800' },
  { id: 'food', label: 'Food', color: '#FFEB3B' },
  { id: 'workshops', label: 'Workshops', color: '#4CAF50' },
  { id: 'community', label: 'Community', color: '#E91E63' },
  { id: 'other', label: 'Other', color: '#9E9E9E' },
];
