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
  address?: string; // Optional street address
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

  // ============================================================
  // POBLACION MAKATI BARS & CLUBS
  // ============================================================
  'ugly duck': {
    lat: 14.5649,
    lng: 121.0295,
    city: 'Makati',
    fullName: 'Ugly Duck Poblacion'
  },
  'ugly duck poblacion': {
    lat: 14.5649,
    lng: 121.0295,
    city: 'Makati'
  },
  'apotheka': {
    lat: 14.5651,
    lng: 121.0297,
    city: 'Makati',
    fullName: 'Apotheka Bar'
  },
  'bar ix': {
    lat: 14.5653,
    lng: 121.0299,
    city: 'Makati',
    fullName: 'BAR IX'
  },
  'bar 9': {
    lat: 14.5653,
    lng: 121.0299,
    city: 'Makati',
    fullName: 'BAR IX'
  },
  'whisky park': {
    lat: 14.5655,
    lng: 121.0301,
    city: 'Makati',
    fullName: 'Whisky Park'
  },
  'whiskey park': {
    lat: 14.5655,
    lng: 121.0301,
    city: 'Makati',
    fullName: 'Whisky Park'
  },
  'limbo': {
    lat: 14.5539,
    lng: 121.0489,
    city: 'Makati',
    fullName: 'Limbo Bar & Lounge'
  },
  'limbo bar': {
    lat: 14.5539,
    lng: 121.0489,
    city: 'Makati',
    fullName: 'Limbo Bar & Lounge'
  },
  'black market': {
    lat: 14.5641,
    lng: 121.0277,
    city: 'Makati',
    fullName: 'Black Market Poblacion'
  },
  'z hostel': {
    lat: 14.5643,
    lng: 121.0279,
    city: 'Makati',
    fullName: 'Z Hostel Rooftop'
  },
  'z hostel rooftop': {
    lat: 14.5643,
    lng: 121.0279,
    city: 'Makati'
  },
  'draft gastropub': {
    lat: 14.5645,
    lng: 121.0281,
    city: 'Makati'
  },
  'single origin': {
    lat: 14.5647,
    lng: 121.0283,
    city: 'Makati',
    fullName: 'Single Origin Coffee'
  },
  'finders keepers': {
    lat: 14.5548,
    lng: 121.0296,
    city: 'Makati',
    fullName: 'Finders Keepers Poblacion'
  },
  'tambai': {
    lat: 14.5550,
    lng: 121.0298,
    city: 'Makati',
    fullName: 'Tambai Bar'
  },
  '20:20': {
    lat: 14.5552,
    lng: 121.0300,
    city: 'Makati',
    fullName: '20:20 Bar'
  },
  'heyday': {
    lat: 14.5637,
    lng: 121.0309,
    city: 'Makati',
    fullName: 'Heyday Cafe'
  },
  'heyday cafe': {
    lat: 14.5637,
    lng: 121.0309,
    city: 'Makati'
  },
  'jess and pats': {
    lat: 14.5639,
    lng: 121.0311,
    city: 'Makati'
  },
  'nokal': {
    lat: 14.5641,
    lng: 121.0313,
    city: 'Makati',
    fullName: 'NoKal MNL'
  },
  'commune': {
    lat: 14.5643,
    lng: 121.0315,
    city: 'Makati',
    fullName: 'Commune Cafe'
  },
  'early night': {
    lat: 14.5645,
    lng: 121.0317,
    city: 'Makati',
    fullName: 'Early Night Bar'
  },

  // ============================================================
  // LIVE MUSIC VENUES
  // ============================================================
  'route 196': {
    lat: 14.6369,
    lng: 121.0789,
    city: 'Quezon City',
    fullName: 'Route 196 Katipunan'
  },
  'route196': {
    lat: 14.6369,
    lng: 121.0789,
    city: 'Quezon City',
    fullName: 'Route 196 Katipunan'
  },
  'saguijo': {
    lat: 14.5636,
    lng: 121.0321,
    city: 'Makati',
    fullName: 'SaGuijo Cafe + Bar'
  },
  'saguijo cafe': {
    lat: 14.5636,
    lng: 121.0321,
    city: 'Makati',
    fullName: 'SaGuijo Cafe + Bar'
  },
  'b-side': {
    lat: 14.5520,
    lng: 121.0230,
    city: 'Makati',
    fullName: 'B-Side'
  },
  'bside': {
    lat: 14.5520,
    lng: 121.0230,
    city: 'Makati',
    fullName: 'B-Side'
  },
  '70s bistro': {
    lat: 14.6281,
    lng: 121.0469,
    city: 'Quezon City',
    fullName: '70s Bistro Anonas'
  },
  '123 block': {
    lat: 14.5734,
    lng: 121.0523,
    city: 'Mandaluyong',
    fullName: '123 Block Events'
  },
  'balcony': {
    lat: 14.5533,
    lng: 121.0485,
    city: 'Makati',
    fullName: 'Balcony Music House'
  },
  'balcony music house': {
    lat: 14.5533,
    lng: 121.0485,
    city: 'Makati'
  },
  '19 east': {
    lat: 14.4879,
    lng: 121.0314,
    city: 'Paranaque',
    fullName: '19 East'
  },
  '19east': {
    lat: 14.4879,
    lng: 121.0314,
    city: 'Paranaque',
    fullName: '19 East'
  },

  // ============================================================
  // ART SPACES & GALLERIES
  // ============================================================
  'gravity art space': {
    lat: 14.5576,
    lng: 120.9875,
    city: 'Manila'
  },
  'spruce gallery': {
    lat: 14.6019,
    lng: 121.0367,
    city: 'San Juan'
  },
  'cine adarna': {
    lat: 14.6545,
    lng: 121.0668,
    city: 'Quezon City',
    fullName: 'UP Cine Adarna'
  },
  'cinema 76': {
    lat: 14.5994,
    lng: 121.0338,
    city: 'San Juan'
  },
  'pineapple lab': {
    lat: 14.6188,
    lng: 121.0515,
    city: 'Quezon City'
  },
  'vinyl on vinyl': {
    lat: 14.5532,
    lng: 121.0185,
    city: 'Makati',
    fullName: 'Vinyl on Vinyl Gallery'
  },
  'underground gallery': {
    lat: 14.5509,
    lng: 121.0472,
    city: 'Taguig'
  },
  '1335mabini': {
    lat: 14.5715,
    lng: 120.9856,
    city: 'Manila',
    fullName: '1335 Mabini Gallery'
  },
  '1335 mabini': {
    lat: 14.5715,
    lng: 120.9856,
    city: 'Manila'
  },

  // ============================================================
  // BGC NIGHTLIFE
  // ============================================================
  'social house': {
    lat: 14.5533,
    lng: 121.0483,
    city: 'Taguig',
    fullName: 'Social House BGC'
  },
  'social house bgc': {
    lat: 14.5533,
    lng: 121.0483,
    city: 'Taguig'
  },
  'the palace pool club': {
    lat: 14.5535,
    lng: 121.0485,
    city: 'Taguig'
  },
  'palace pool club': {
    lat: 14.5535,
    lng: 121.0485,
    city: 'Taguig',
    fullName: 'The Palace Pool Club'
  },
  'valkyrie': {
    lat: 14.5537,
    lng: 121.0487,
    city: 'Taguig',
    fullName: 'Valkyrie BGC'
  },
  'revel': {
    lat: 14.5539,
    lng: 121.0489,
    city: 'Taguig',
    fullName: 'Revel at The Palace'
  },
  'pool club': {
    lat: 14.5541,
    lng: 121.0491,
    city: 'Taguig',
    fullName: 'Pool Club BGC'
  },
  'bunk': {
    lat: 14.5543,
    lng: 121.0493,
    city: 'Taguig',
    fullName: 'Bunk BGC'
  },
  'xylo': {
    lat: 14.5545,
    lng: 121.0495,
    city: 'Taguig',
    fullName: 'XYLO at The Palace'
  },

  // ============================================================
  // HOTELS & LARGE VENUES
  // ============================================================
  'okada': {
    lat: 14.5253,
    lng: 120.9792,
    city: 'Paranaque',
    fullName: 'Okada Manila'
  },
  'okada manila': {
    lat: 14.5253,
    lng: 120.9792,
    city: 'Paranaque'
  },
  'solaire': {
    lat: 14.5258,
    lng: 120.9780,
    city: 'Paranaque',
    fullName: 'Solaire Resort'
  },
  'city of dreams': {
    lat: 14.5260,
    lng: 120.9795,
    city: 'Paranaque',
    fullName: 'City of Dreams Manila'
  },
  'samsung hall': {
    lat: 14.5497,
    lng: 121.0551,
    city: 'Taguig',
    fullName: 'Samsung Hall SM Aura'
  },
  'new frontier theater': {
    lat: 14.6202,
    lng: 121.0531,
    city: 'Quezon City'
  },
  'moa arena': {
    lat: 14.5359,
    lng: 120.9826,
    city: 'Pasay',
    fullName: 'Mall of Asia Arena'
  },
  'mall of asia arena': {
    lat: 14.5359,
    lng: 120.9826,
    city: 'Pasay'
  },

  // ============================================================
  // OTHER POPULAR VENUES
  // ============================================================
  'vector billiards': {
    lat: 14.5867,
    lng: 121.0572,
    city: 'Pasig'
  },
  'the fifth': {
    lat: 14.5636,
    lng: 121.0359,
    city: 'Makati',
    fullName: 'The Fifth at Rockwell'
  },
  '3 torre lorenzo': {
    lat: 14.5574,
    lng: 120.9878,
    city: 'Manila'
  },
  'centris elements': {
    lat: 14.6425,
    lng: 121.0493,
    city: 'Quezon City'
  },
  'forbestown': {
    lat: 14.5528,
    lng: 121.0465,
    city: 'Taguig',
    fullName: 'Forbestown BGC'
  },
  'yardstick': {
    lat: 14.5583,
    lng: 121.0187,
    city: 'Makati',
    fullName: 'Yardstick Coffee'
  },
  'the alley at karrivin': {
    lat: 14.5485,
    lng: 121.0336,
    city: 'Makati'
  },
  'karrivin': {
    lat: 14.5485,
    lng: 121.0336,
    city: 'Makati',
    fullName: 'The Alley at Karrivin'
  },
  
  // ============================================================
  // PHASE 6 ADDITIONS - Missing Venues from Audit
  // ============================================================
  'the jungle': {
    lat: 14.5657,
    lng: 121.0290,
    city: 'Makati',
    fullName: 'The Jungle Poblacion'
  },
  'the jungle poblacion': {
    lat: 14.5657,
    lng: 121.0290,
    city: 'Makati'
  },
  'jungle poblacion': {
    lat: 14.5657,
    lng: 121.0290,
    city: 'Makati',
    fullName: 'The Jungle Poblacion'
  },
  'walrus': {
    lat: 14.6355,
    lng: 121.0788,
    city: 'Quezon City',
    fullName: 'Walrus Katipunan'
  },
  'walrus katipunan': {
    lat: 14.6355,
    lng: 121.0788,
    city: 'Quezon City'
  },
  'walrus qc': {
    lat: 14.6355,
    lng: 121.0788,
    city: 'Quezon City',
    fullName: 'Walrus Katipunan'
  },
  "ruby wong's": {
    lat: 14.5654,
    lng: 121.0293,
    city: 'Makati',
    fullName: "Ruby Wong's"
  },
  'ruby wongs': {
    lat: 14.5654,
    lng: 121.0293,
    city: 'Makati',
    fullName: "Ruby Wong's"
  },
  'ruby wong': {
    lat: 14.5654,
    lng: 121.0293,
    city: 'Makati',
    fullName: "Ruby Wong's"
  },
  'the funroof': {
    lat: 14.5567,
    lng: 121.0299,
    city: 'Makati',
    fullName: 'The Funroof'
  },
  'funroof': {
    lat: 14.5567,
    lng: 121.0299,
    city: 'Makati',
    fullName: 'The Funroof'
  },
  'up nsc amphitheater': {
    lat: 14.6470,
    lng: 121.0700,
    city: 'Quezon City',
    fullName: 'UP National Science Complex Amphitheater'
  },
  'up national science complex': {
    lat: 14.6470,
    lng: 121.0700,
    city: 'Quezon City',
    fullName: 'UP National Science Complex Amphitheater'
  },
  'up national science complex amphitheater': {
    lat: 14.6470,
    lng: 121.0700,
    city: 'Quezon City'
  },
  'nsc amphitheater': {
    lat: 14.6470,
    lng: 121.0700,
    city: 'Quezon City',
    fullName: 'UP National Science Complex Amphitheater'
  },
  '5g coffee house': {
    lat: 14.5736,
    lng: 121.0617,
    city: 'Pasig',
    fullName: '5G Coffee House'
  },
  '5g coffee': {
    lat: 14.5736,
    lng: 121.0617,
    city: 'Pasig',
    fullName: '5G Coffee House'
  },
  '5g': {
    lat: 14.5736,
    lng: 121.0617,
    city: 'Pasig',
    fullName: '5G Coffee House'
  },
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Database venue cache (populated on first query)
let dbVenueCache: Map<string, VenueData> | null = null;
let dbAliasMappings: Map<string, string> | null = null;

/**
 * PHASE 1: Normalize venue name for lookup with apostrophe/quote handling
 * - Unify all apostrophe/quote variants to standard
 * - Remove punctuation
 * - Collapse spaces
 * - Convert to lowercase
 */
export function normalizeForLookup(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    // Decode common HTML entities first
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Unify all apostrophe/quote variants to standard single quote then remove
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u0027''`´]/g, '')
    // Remove all punctuation except letters, numbers, spaces
    .replace(/[^a-z0-9\s]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Legacy normalize for cache keys (backwards compatibility)
 */
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(the|sm)\s+/i, '')
    .replace(/\s+(mall|center|city|plaza)$/i, '');
}

/**
 * PHASE 2 (Option C): Load venues from database on startup
 * Populates dbVenueCache and dbAliasMappings from known_venues table
 */
async function loadDatabaseVenues(): Promise<void> {
  if (dbVenueCache !== null) return; // Already loaded
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[ncrGeoCache] Missing Supabase credentials, DB fallback disabled');
    dbVenueCache = new Map();
    dbAliasMappings = new Map();
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: venues, error } = await supabase
      .from('known_venues')
      .select('name, aliases, lat, lng, city')
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    
    if (error) {
      console.error('[ncrGeoCache] Failed to load venues from DB:', error.message);
      dbVenueCache = new Map();
      dbAliasMappings = new Map();
      return;
    }
    
    dbVenueCache = new Map();
    dbAliasMappings = new Map();
    
    for (const venue of venues || []) {
      if (!venue.lat || !venue.lng) continue;
      
      const venueData: VenueData = {
        lat: Number(venue.lat),
        lng: Number(venue.lng),
        city: venue.city || 'Metro Manila',
        fullName: venue.name
      };
      
      // Add normalized main name
      const normalizedName = normalizeForLookup(venue.name);
      dbVenueCache.set(normalizedName, venueData);
      dbAliasMappings.set(normalizedName, venue.name);
      
      // Add all normalized aliases
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string' && alias.trim()) {
            const normalizedAlias = normalizeForLookup(alias);
            if (!dbVenueCache.has(normalizedAlias)) {
              dbVenueCache.set(normalizedAlias, venueData);
              dbAliasMappings.set(normalizedAlias, venue.name);
            }
          }
        }
      }
    }
    
    console.log(`[ncrGeoCache] Loaded ${dbVenueCache.size} venue entries from database`);
  } catch (err) {
    console.error('[ncrGeoCache] Error loading DB venues:', err);
    dbVenueCache = new Map();
    dbAliasMappings = new Map();
  }
}

/**
 * Match type for known venue lookups
 */
export type VenueMatchType = 'exact_name' | 'exact_alias' | 'normalized_name' | 'normalized_alias' | 'word_match' | 'partial_name' | 'partial_alias' | 'fuzzy';

/**
 * Check if all words from the shorter string appear in the longer string
 * Used for word-based venue matching
 * 
 * Examples:
 * - "Odd Cafe" matches "Odd Cafe Makati" (all words from search appear in target)
 * - "Fireside" matches "Fireside by Kettle" (all words from search appear in target)
 * 
 * @param normalizedSearch - The normalized search term
 * @param normalizedTarget - The normalized target venue name
 * @returns true if all words from the shorter string appear in the longer string
 */
function checkWordMatch(normalizedSearch: string, normalizedTarget: string): boolean {
  const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length >= 3);
  const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length >= 3);
  
  // Both must have words for a valid match
  if (searchWords.length === 0 || targetWords.length === 0) return false;
  
  // Determine which is shorter and which is longer
  const shorterWords = searchWords.length <= targetWords.length ? searchWords : targetWords;
  const longerWordsSet = new Set(searchWords.length <= targetWords.length ? targetWords : searchWords);
  
  // Check if all words from shorter list appear in longer list
  return shorterWords.every(word => longerWordsSet.has(word));
}

/**
 * Lookup venues in the known_venues database FIRST with comprehensive matching
 * This should be the PRIMARY venue lookup method
 * 
 * Matching strategy:
 * 1. Exact name match (case-insensitive)
 * 2. Exact alias match (case-insensitive) 
 * 3. Normalized exact name match
 * 4. Normalized exact alias match
 * 5. Word-based match
 * 6. Partial/contains match on name and aliases
 * 7. Fuzzy match with 0.75 threshold
 * 
 * Returns matched venue with lat, lng, city, and canonical name
 */
export async function lookupKnownVenuesFirst(venueName: string): Promise<{
  lat: number;
  lng: number;
  city: string;
  canonicalName: string;
  matchType: VenueMatchType;
  address?: string; // Return address from known_venues
} | null> {
  if (!venueName) return null;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[lookupKnownVenuesFirst] Missing Supabase credentials');
    return null;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch ALL venues from known_venues (no limit)
    // NOTE: This fetches all venues on every call. If the database grows significantly
    // (e.g., beyond 500-1000 venues), consider implementing caching similar to 
    // loadDatabaseVenues() or using database-side fuzzy matching with pg_trgm.
    const { data: venues, error } = await supabase
      .from('known_venues')
      .select('name, aliases, lat, lng, city, address')
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    
    if (error || !venues || venues.length === 0) {
      if (error) {
        console.error('[lookupKnownVenuesFirst] Query error:', error.message);
      }
      return null;
    }
    
    const searchTerm = venueName.toLowerCase().trim();
    const normalizedSearch = normalizeForLookup(venueName);
    
    // 1. Try exact name match (case-insensitive)
    for (const venue of venues) {
      if (venue.name?.toLowerCase() === searchTerm) {
        return {
          lat: Number(venue.lat),
          lng: Number(venue.lng),
          city: venue.city || 'Metro Manila',
          canonicalName: venue.name,
          matchType: 'exact_name',
          address: venue.address || undefined
        };
      }
    }
    
    // 2. Try exact alias match (case-insensitive)
    for (const venue of venues) {
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string' && alias.toLowerCase() === searchTerm) {
            return {
              lat: Number(venue.lat),
              lng: Number(venue.lng),
              city: venue.city || 'Metro Manila',
              canonicalName: venue.name,
              matchType: 'exact_alias',
              address: venue.address || undefined
            };
          }
        }
      }
    }
    
    // 3. Try normalized exact name match
    for (const venue of venues) {
      const normalizedVenueName = normalizeForLookup(venue.name || '');
      if (normalizedVenueName && normalizedVenueName === normalizedSearch) {
        return {
          lat: Number(venue.lat),
          lng: Number(venue.lng),
          city: venue.city || 'Metro Manila',
          canonicalName: venue.name,
          matchType: 'normalized_name',
          address: venue.address || undefined
        };
      }
    }
    
    // 4. Try normalized exact alias match
    for (const venue of venues) {
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string') {
            const normalizedAlias = normalizeForLookup(alias);
            if (normalizedAlias && normalizedAlias === normalizedSearch) {
              return {
                lat: Number(venue.lat),
                lng: Number(venue.lng),
                city: venue.city || 'Metro Manila',
                canonicalName: venue.name,
                matchType: 'normalized_alias',
                address: venue.address || undefined
              };
            }
          }
        }
      }
    }
    
    // 5. Try word-based match (all words from one appear in the other)
    for (const venue of venues) {
      const normalizedVenueName = normalizeForLookup(venue.name || '');
      if (checkWordMatch(normalizedSearch, normalizedVenueName)) {
        return {
          lat: Number(venue.lat),
          lng: Number(venue.lng),
          city: venue.city || 'Metro Manila',
          canonicalName: venue.name,
          matchType: 'word_match',
          address: venue.address || undefined
        };
      }
    }
    
    // Also check word match on aliases
    for (const venue of venues) {
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string') {
            const normalizedAlias = normalizeForLookup(alias);
            if (checkWordMatch(normalizedSearch, normalizedAlias)) {
              return {
                lat: Number(venue.lat),
                lng: Number(venue.lng),
                city: venue.city || 'Metro Manila',
                canonicalName: venue.name,
                matchType: 'word_match',
                address: venue.address || undefined
              };
            }
          }
        }
      }
    }
    
    // 6. Try partial/contains match on name
    for (const venue of venues) {
      const venueLower = venue.name?.toLowerCase() || '';
      // Check if one contains the other (with minimum length check to avoid false positives)
      if (searchTerm.length >= 3 && venueLower.length >= 3 &&
          (venueLower.includes(searchTerm) || searchTerm.includes(venueLower))) {
        return {
          lat: Number(venue.lat),
          lng: Number(venue.lng),
          city: venue.city || 'Metro Manila',
          canonicalName: venue.name,
          matchType: 'partial_name',
          address: venue.address || undefined
        };
      }
    }
    
    // 7. Try partial/contains match on aliases
    for (const venue of venues) {
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string') {
            const aliasLower = alias.toLowerCase();
            // Check if one contains the other (with minimum length check to avoid false positives)
            if (searchTerm.length >= 3 && aliasLower.length >= 3 &&
                (aliasLower.includes(searchTerm) || searchTerm.includes(aliasLower))) {
              return {
                lat: Number(venue.lat),
                lng: Number(venue.lng),
                city: venue.city || 'Metro Manila',
                canonicalName: venue.name,
                matchType: 'partial_alias',
                address: venue.address || undefined
              };
            }
          }
        }
      }
    }
    
    // 8. Try fuzzy matching with higher threshold (0.75) for known venues
    let bestFuzzyMatch: { venue: { name: string; aliases?: string[]; lat: number; lng: number; city?: string }; score: number } | null = null;
    
    for (const venue of venues) {
      const normalizedVenueName = normalizeForLookup(venue.name || '');
      const score = calculateSimilarity(normalizedSearch, normalizedVenueName);
      
      if (score >= KNOWN_VENUE_FUZZY_THRESHOLD && (!bestFuzzyMatch || score > bestFuzzyMatch.score)) {
        bestFuzzyMatch = { venue, score };
      }
      
      // Also check aliases
      if (Array.isArray(venue.aliases)) {
        for (const alias of venue.aliases) {
          if (typeof alias === 'string') {
            const normalizedAlias = normalizeForLookup(alias);
            const aliasScore = calculateSimilarity(normalizedSearch, normalizedAlias);
            
            if (aliasScore >= KNOWN_VENUE_FUZZY_THRESHOLD && (!bestFuzzyMatch || aliasScore > bestFuzzyMatch.score)) {
              bestFuzzyMatch = { venue, score: aliasScore };
            }
          }
        }
      }
    }
    
    if (bestFuzzyMatch) {
      return {
        lat: Number(bestFuzzyMatch.venue.lat),
        lng: Number(bestFuzzyMatch.venue.lng),
        city: bestFuzzyMatch.venue.city || 'Metro Manila',
        canonicalName: bestFuzzyMatch.venue.name,
        matchType: 'fuzzy',
        address: (bestFuzzyMatch.venue as any).address || undefined
      };
    }
    
    return null;
  } catch (err) {
    console.error('[lookupKnownVenuesFirst] Error:', err);
    return null;
  }
}

/**
 * Direct lookup of NCR venue in cache with normalization
 * Tries: 1) Local cache, 2) Database cache (loaded on startup)
 */
export async function lookupNCRVenueAsync(venueName: string): Promise<VenueData | null> {
  if (!venueName) return null;
  
  const normalized = normalizeForLookup(venueName);
  const basicNormalized = venueName.toLowerCase().trim();
  
  // Try local cache with exact match first (for speed)
  if (NCR_VENUE_GEOCACHE[basicNormalized]) {
    return NCR_VENUE_GEOCACHE[basicNormalized];
  }
  
  // Try local cache with normalized lookup
  for (const [key, data] of Object.entries(NCR_VENUE_GEOCACHE)) {
    if (normalizeForLookup(key) === normalized) {
      return data;
    }
  }
  
  // Load and check database cache
  await loadDatabaseVenues();
  
  if (dbVenueCache && dbVenueCache.has(normalized)) {
    const data = dbVenueCache.get(normalized)!;
    console.log(`[ncrGeoCache] DB cache hit: "${venueName}" -> "${dbAliasMappings?.get(normalized)}"`);
    return data;
  }
  
  return null;
}

/**
 * Sync lookup (backwards compatible) - uses local cache only
 */
export function lookupNCRVenue(venueName: string): VenueData | null {
  if (!venueName) return null;
  
  const normalized = normalizeForLookup(venueName);
  const basicNormalized = venueName.toLowerCase().trim();
  
  // Try exact match first
  if (NCR_VENUE_GEOCACHE[basicNormalized]) {
    return NCR_VENUE_GEOCACHE[basicNormalized];
  }
  
  // Try normalized lookup
  for (const [key, data] of Object.entries(NCR_VENUE_GEOCACHE)) {
    if (normalizeForLookup(key) === normalized) {
      return data;
    }
  }
  
  return null;
}

// Fuzzy matching constants
export const SUBSTRING_BASE_SCORE = 0.85;  // Base score when one string contains another
export const SUBSTRING_BONUS_RANGE = 0.15; // Additional bonus based on length ratio
export const DEFAULT_FUZZY_THRESHOLD = 0.5; // Default threshold for fuzzy matching
export const KNOWN_VENUE_FUZZY_THRESHOLD = 0.75; // Stricter threshold for known venue lookups

/**
 * Fuzzy matching for venue names using string similarity
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Simple contains check - return HIGH score (0.85+) for full containment
  // This is a strong match indicator
  if (longer.includes(shorter)) {
    return SUBSTRING_BASE_SCORE + (shorter.length / longer.length) * SUBSTRING_BONUS_RANGE;
  }
  
  // Word-level matches
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matchedWords = 0;
  for (const word1 of words1) {
    if (word1.length < 3) continue;
    for (const word2 of words2) {
      if (word1 === word2) {
        matchedWords++;
        break;
      }
    }
  }
  
  return matchedWords / Math.max(words1.length, words2.length);
}

/**
 * Fuzzy match venue with async DB fallback
 */
export async function fuzzyMatchVenueAsync(
  venueName: string,
  threshold: number = DEFAULT_FUZZY_THRESHOLD
): Promise<{ lat: number; lng: number; city: string; matchedName: string } | null> {
  if (!venueName || threshold < 0 || threshold > 1) return null;
  
  // First try async exact lookup (includes DB)
  const exactMatch = await lookupNCRVenueAsync(venueName);
  if (exactMatch) {
    return {
      lat: exactMatch.lat,
      lng: exactMatch.lng,
      city: exactMatch.city,
      matchedName: exactMatch.fullName || venueName,
    };
  }
  
  const normalized = normalizeForLookup(venueName);
  let bestMatch: { name: string; data: VenueData; score: number } | null = null;
  
  // Search local cache
  for (const [cachedName, data] of Object.entries(NCR_VENUE_GEOCACHE)) {
    const cachedNormalized = normalizeForLookup(cachedName);
    const score = calculateSimilarity(normalized, cachedNormalized);
    
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name: cachedName, data, score };
    }
  }
  
  // Search DB cache
  await loadDatabaseVenues();
  if (dbVenueCache) {
    for (const [cachedNormalized, data] of dbVenueCache.entries()) {
      const score = calculateSimilarity(normalized, cachedNormalized);
      
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { name: dbAliasMappings?.get(cachedNormalized) || cachedNormalized, data, score };
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

/**
 * Sync fuzzy match (backwards compatible) - uses local cache only
 */
export function fuzzyMatchVenue(
  venueName: string,
  threshold: number = DEFAULT_FUZZY_THRESHOLD
): { lat: number; lng: number; city: string; matchedName: string } | null {
  if (!venueName || threshold < 0 || threshold > 1) return null;
  
  const normalized = normalizeForLookup(venueName);
  let bestMatch: { name: string; data: VenueData; score: number } | null = null;
  
  for (const [cachedName, data] of Object.entries(NCR_VENUE_GEOCACHE)) {
    const cachedNormalized = normalizeForLookup(cachedName);
    const score = calculateSimilarity(normalized, cachedNormalized);
    
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name: cachedName, data, score };
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
