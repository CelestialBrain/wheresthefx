/**
 * NCR (National Capital Region / Metro Manila) Venue Geocache
 * 
 * Provides a local cache of well-known NCR venues to:
 * - Reduce external geocoding API calls
 * - Improve hit rate for common venues
 * - Provide fallback when geocoding API fails
 * 
 * Data sources: Google Maps, OpenStreetMap, manual verification
 */

/**
 * Venue data structure
 */
export interface VenueData {
  lat: number;
  lng: number;
  city: string;
  fullName?: string; // Optional canonical full name
}

/**
 * NCR Venue Geocache - Common venues across Metro Manila
 * Key: venue name (lowercase, normalized)
 * Value: { lat, lng, city, fullName (optional) }
 */
export const NCR_VENUE_GEOCACHE: Record<string, VenueData> = {
  // ============================================================
  // QUEZON CITY
  // ============================================================
  'sm north edsa': {
    lat: 14.6565,
    lng: 121.0296,
    city: 'Quezon City',
    fullName: 'SM City North EDSA'
  },
  'sm city north edsa': {
    lat: 14.6565,
    lng: 121.0296,
    city: 'Quezon City'
  },
  'trinoma': {
    lat: 14.6561,
    lng: 121.0327,
    city: 'Quezon City',
    fullName: 'Trinoma Mall'
  },
  'trinoma mall': {
    lat: 14.6561,
    lng: 121.0327,
    city: 'Quezon City'
  },
  'eastwood city': {
    lat: 14.6094,
    lng: 121.0775,
    city: 'Quezon City'
  },
  'eastwood': {
    lat: 14.6094,
    lng: 121.0775,
    city: 'Quezon City',
    fullName: 'Eastwood City'
  },
  'up town center': {
    lat: 14.6527,
    lng: 121.0693,
    city: 'Quezon City'
  },
  'uptc': {
    lat: 14.6527,
    lng: 121.0693,
    city: 'Quezon City',
    fullName: 'UP Town Center'
  },
  'eton centris': {
    lat: 14.6423,
    lng: 121.0491,
    city: 'Quezon City'
  },
  'centris': {
    lat: 14.6423,
    lng: 121.0491,
    city: 'Quezon City',
    fullName: 'Eton Centris'
  },
  'cubao expo': {
    lat: 14.6193,
    lng: 121.0519,
    city: 'Quezon City'
  },
  'araneta city': {
    lat: 14.6206,
    lng: 121.0525,
    city: 'Quezon City'
  },
  'araneta coliseum': {
    lat: 14.6209,
    lng: 121.0517,
    city: 'Quezon City',
    fullName: 'Smart Araneta Coliseum'
  },
  'smart araneta coliseum': {
    lat: 14.6209,
    lng: 121.0517,
    city: 'Quezon City'
  },
  'gateway mall': {
    lat: 14.6197,
    lng: 121.0529,
    city: 'Quezon City',
    fullName: 'Gateway Mall Cubao'
  },
  'sm fairview': {
    lat: 14.7131,
    lng: 121.0563,
    city: 'Quezon City',
    fullName: 'SM City Fairview'
  },
  'fairview terraces': {
    lat: 14.7129,
    lng: 121.0583,
    city: 'Quezon City'
  },
  'vertis north': {
    lat: 14.6448,
    lng: 121.0484,
    city: 'Quezon City'
  },

  // ============================================================
  // BGC / TAGUIG
  // ============================================================
  'bonifacio high street': {
    lat: 14.5505,
    lng: 121.0515,
    city: 'Taguig',
    fullName: 'Bonifacio High Street'
  },
  'bgc high street': {
    lat: 14.5505,
    lng: 121.0515,
    city: 'Taguig',
    fullName: 'Bonifacio High Street'
  },
  'high street': {
    lat: 14.5505,
    lng: 121.0515,
    city: 'Taguig',
    fullName: 'Bonifacio High Street'
  },
  'uptown mall': {
    lat: 14.5657,
    lng: 121.0534,
    city: 'Taguig',
    fullName: 'Uptown Bonifacio'
  },
  'uptown bonifacio': {
    lat: 14.5657,
    lng: 121.0534,
    city: 'Taguig'
  },
  'uptown bgc': {
    lat: 14.5657,
    lng: 121.0534,
    city: 'Taguig',
    fullName: 'Uptown Bonifacio'
  },
  'the fort': {
    lat: 14.5507,
    lng: 121.0470,
    city: 'Taguig',
    fullName: 'Bonifacio Global City'
  },
  'bgc': {
    lat: 14.5507,
    lng: 121.0470,
    city: 'Taguig',
    fullName: 'Bonifacio Global City'
  },
  'bonifacio global city': {
    lat: 14.5507,
    lng: 121.0470,
    city: 'Taguig'
  },
  'market market': {
    lat: 14.5491,
    lng: 121.0553,
    city: 'Taguig'
  },
  'serendra': {
    lat: 14.5514,
    lng: 121.0458,
    city: 'Taguig',
    fullName: 'Serendra BGC'
  },
  'venice piazza': {
    lat: 14.5534,
    lng: 121.0502,
    city: 'Taguig',
    fullName: 'Venice Grand Canal Mall'
  },
  'venice grand canal': {
    lat: 14.5534,
    lng: 121.0502,
    city: 'Taguig'
  },

  // ============================================================
  // MAKATI
  // ============================================================
  'greenbelt': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati'
  },
  'greenbelt 1': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati',
    fullName: 'Greenbelt'
  },
  'greenbelt 2': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati',
    fullName: 'Greenbelt'
  },
  'greenbelt 3': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati',
    fullName: 'Greenbelt'
  },
  'greenbelt 4': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati',
    fullName: 'Greenbelt'
  },
  'greenbelt 5': {
    lat: 14.5531,
    lng: 121.0223,
    city: 'Makati',
    fullName: 'Greenbelt'
  },
  'glorietta': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati'
  },
  'glorietta 1': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati',
    fullName: 'Glorietta'
  },
  'glorietta 2': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati',
    fullName: 'Glorietta'
  },
  'glorietta 3': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati',
    fullName: 'Glorietta'
  },
  'glorietta 4': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati',
    fullName: 'Glorietta'
  },
  'glorietta 5': {
    lat: 14.5502,
    lng: 121.0249,
    city: 'Makati',
    fullName: 'Glorietta'
  },
  'ayala triangle': {
    lat: 14.5573,
    lng: 121.0244,
    city: 'Makati',
    fullName: 'Ayala Triangle Gardens'
  },
  'ayala triangle gardens': {
    lat: 14.5573,
    lng: 121.0244,
    city: 'Makati'
  },
  'poblacion': {
    lat: 14.5587,
    lng: 121.0239,
    city: 'Makati',
    fullName: 'Poblacion Makati'
  },
  'poblacion makati': {
    lat: 14.5587,
    lng: 121.0239,
    city: 'Makati'
  },
  'legazpi village': {
    lat: 14.5565,
    lng: 121.0172,
    city: 'Makati'
  },
  'salcedo village': {
    lat: 14.5608,
    lng: 121.0186,
    city: 'Makati'
  },
  'salcedo market': {
    lat: 14.5608,
    lng: 121.0186,
    city: 'Makati',
    fullName: 'Salcedo Saturday Market'
  },
  'power plant mall': {
    lat: 14.5634,
    lng: 121.0357,
    city: 'Makati'
  },
  'rockwell': {
    lat: 14.5634,
    lng: 121.0357,
    city: 'Makati',
    fullName: 'Rockwell Center'
  },
  'rockwell center': {
    lat: 14.5634,
    lng: 121.0357,
    city: 'Makati'
  },

  // ============================================================
  // PASIG
  // ============================================================
  'sm megamall': {
    lat: 14.5850,
    lng: 121.0564,
    city: 'Pasig'
  },
  'megamall': {
    lat: 14.5850,
    lng: 121.0564,
    city: 'Pasig',
    fullName: 'SM Megamall'
  },
  'ortigas center': {
    lat: 14.5864,
    lng: 121.0564,
    city: 'Pasig'
  },
  'ortigas': {
    lat: 14.5864,
    lng: 121.0564,
    city: 'Pasig',
    fullName: 'Ortigas Center'
  },
  'capitol commons': {
    lat: 14.5826,
    lng: 121.0603,
    city: 'Pasig'
  },
  'the podium': {
    lat: 14.5828,
    lng: 121.0567,
    city: 'Pasig'
  },
  'podium': {
    lat: 14.5828,
    lng: 121.0567,
    city: 'Pasig',
    fullName: 'The Podium'
  },
  'estancia': {
    lat: 14.5826,
    lng: 121.0603,
    city: 'Pasig',
    fullName: 'Estancia Capitol Commons'
  },
  'estancia capitol commons': {
    lat: 14.5826,
    lng: 121.0603,
    city: 'Pasig'
  },
  'tiendesitas': {
    lat: 14.5908,
    lng: 121.0699,
    city: 'Pasig'
  },

  // ============================================================
  // MANDALUYONG
  // ============================================================
  'shangri-la plaza': {
    lat: 14.5813,
    lng: 121.0545,
    city: 'Mandaluyong'
  },
  'shang': {
    lat: 14.5813,
    lng: 121.0545,
    city: 'Mandaluyong',
    fullName: 'Shangri-La Plaza'
  },
  'edsa shangri-la': {
    lat: 14.5813,
    lng: 121.0545,
    city: 'Mandaluyong',
    fullName: 'EDSA Shangri-La Hotel'
  },

  // ============================================================
  // MANILA
  // ============================================================
  'sm mall of asia': {
    lat: 14.5352,
    lng: 120.9818,
    city: 'Pasay',
    fullName: 'SM Mall of Asia'
  },
  'moa': {
    lat: 14.5352,
    lng: 120.9818,
    city: 'Pasay',
    fullName: 'SM Mall of Asia'
  },
  'mall of asia': {
    lat: 14.5352,
    lng: 120.9818,
    city: 'Pasay',
    fullName: 'SM Mall of Asia'
  },
  'intramuros': {
    lat: 14.5906,
    lng: 120.9753,
    city: 'Manila'
  },
  'binondo': {
    lat: 14.5992,
    lng: 120.9742,
    city: 'Manila'
  },
  'ermita': {
    lat: 14.5833,
    lng: 120.9858,
    city: 'Manila'
  },
  'malate': {
    lat: 14.5739,
    lng: 120.9914,
    city: 'Manila'
  },
  'rizal park': {
    lat: 14.5831,
    lng: 120.9794,
    city: 'Manila',
    fullName: 'Rizal Park (Luneta)'
  },
  'luneta': {
    lat: 14.5831,
    lng: 120.9794,
    city: 'Manila',
    fullName: 'Rizal Park (Luneta)'
  },

  // ============================================================
  // ALABANG / OTHER AREAS
  // ============================================================
  'alabang town center': {
    lat: 14.4208,
    lng: 121.0419,
    city: 'Muntinlupa',
    fullName: 'Alabang Town Center'
  },
  'atc': {
    lat: 14.4208,
    lng: 121.0419,
    city: 'Muntinlupa',
    fullName: 'Alabang Town Center'
  },
  'festival mall': {
    lat: 14.4189,
    lng: 121.0476,
    city: 'Muntinlupa',
    fullName: 'Festival Supermall'
  },
  'festival supermall': {
    lat: 14.4189,
    lng: 121.0476,
    city: 'Muntinlupa'
  },
};

/**
 * Normalize venue name for lookup
 * - Convert to lowercase
 * - Trim whitespace
 * - Remove common prefixes/suffixes
 */
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(the|sm)\s+/i, '') // Remove "the" or "sm" prefix for broader matching
    .replace(/\s+(mall|center|city|plaza)$/i, ''); // Remove common suffixes
}

/**
 * Direct lookup of NCR venue in cache
 * Returns venue data if exact match found, null otherwise
 */
export function lookupNCRVenue(venueName: string): VenueData | null {
  if (!venueName) return null;
  
  const normalized = venueName.toLowerCase().trim();
  
  // Try exact match first
  if (NCR_VENUE_GEOCACHE[normalized]) {
    return NCR_VENUE_GEOCACHE[normalized];
  }
  
  return null;
}

/**
 * Fuzzy matching for venue names using string similarity
 * Uses Levenshtein-like approach for matching
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Simple contains check - if shorter is contained in longer, high score
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Check for word-level matches
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matchedWords = 0;
  for (const word1 of words1) {
    if (word1.length < 3) continue; // Skip short words
    for (const word2 of words2) {
      if (word1 === word2) {
        matchedWords++;
        break;
      }
    }
  }
  
  const wordScore = matchedWords / Math.max(words1.length, words2.length);
  
  return wordScore;
}

/**
 * Fuzzy match venue name against cache
 * Returns best match if similarity >= threshold, null otherwise
 * 
 * @param venueName - Venue name to match
 * @param threshold - Similarity threshold (0-1), default 0.7
 * @returns Matched venue data with matched name, or null
 */
export function fuzzyMatchVenue(
  venueName: string,
  threshold: number = 0.7
): { lat: number; lng: number; city: string; matchedName: string } | null {
  if (!venueName || threshold < 0 || threshold > 1) return null;
  
  const normalized = normalizeVenueName(venueName);
  let bestMatch: { name: string; data: VenueData; score: number } | null = null;
  
  // Iterate through cache and find best match
  for (const [cachedName, data] of Object.entries(NCR_VENUE_GEOCACHE)) {
    const cachedNormalized = normalizeVenueName(cachedName);
    const score = calculateSimilarity(normalized, cachedNormalized);
    
    if (score >= threshold) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { name: cachedName, data, score };
      }
    }
  }
  
  if (bestMatch) {
    return {
      lat: bestMatch.data.lat,
      lng: bestMatch.data.lng,
      city: bestMatch.data.city,
      matchedName: bestMatch.data.fullName || bestMatch.name,
    };
  }
  
  return null;
}
