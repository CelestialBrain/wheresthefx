/**
 * Test utilities for scraper tests
 * Provides helpers for testing extraction logic, statistics, and dataset access
 */

/**
 * Statistics for extraction performance
 */
export interface ExtractionStats {
  totalPosts: number;
  postsWithDate: number;
  postsWithTime: number;
  postsWithLocation: number;
  postsWithPrice: number;
  postsWithCoordinates: number;
  dateExtractionRate: number;
  timeExtractionRate: number;
  locationExtractionRate: number;
  priceExtractionRate: number;
  geocodingSuccessRate: number;
}

/**
 * Parsed event data structure
 */
export interface ParsedEvent {
  postId: string;
  eventDate: string | null;
  eventTime: string | null;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  price: number | null;
  isFree: boolean;
}

/**
 * Apify dataset item structure for testing
 */
export interface ApifyDatasetItem {
  id?: string;
  shortCode?: string;
  caption?: string;
  locationName?: string | null;
  displayUrl?: string;
  type?: 'Sidecar' | 'Image' | 'Video';
  childPosts?: Array<{
    displayUrl?: string;
    type?: string;
  }>;
}

/**
 * Fetch test data from Apify dataset
 * Uses the provided endpoint from the problem statement
 * 
 * @param limit - Maximum number of items to fetch (default: 100)
 * @returns Array of dataset items
 */
export async function fetchTestDataset(limit: number = 100): Promise<ApifyDatasetItem[]> {
  const APIFY_DATASET_URL = 'https://api.apify.com/v2/datasets/Roxe1UhwxvzpGB1RI/items?token=apify_api_OqSQr5cakF5qfrlMCC4HVteXkdBIQ227UoKC';
  
  try {
    const response = await fetch(`${APIFY_DATASET_URL}&limit=${limit}&clean=1`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as ApifyDatasetItem[];
  } catch (error) {
    console.error('Error fetching test dataset:', error);
    throw error;
  }
}

/**
 * Assert that a time string is valid (HH:MM:SS format, valid hours and minutes)
 */
export function assertValidTime(time: string | null): void {
  if (!time) {
    throw new Error('Time is null');
  }
  
  const timePattern = /^([0-1][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/;
  if (!timePattern.test(time)) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM:SS`);
  }
  
  const [hours, minutes, seconds] = time.split(':').map(Number);
  
  if (hours < 0 || hours > 23) {
    throw new Error(`Invalid hours: ${hours}. Must be 0-23`);
  }
  
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Must be 0-59`);
  }
  
  if (seconds < 0 || seconds > 59) {
    throw new Error(`Invalid seconds: ${seconds}. Must be 0-59`);
  }
}

/**
 * Assert that a date string is valid (YYYY-MM-DD format)
 */
export function assertValidDate(date: string | null): void {
  if (!date) {
    throw new Error('Date is null');
  }
  
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  
  // Check that the date components match (to catch invalid dates like Feb 30)
  const [year, month, day] = date.split('-').map(Number);
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
    throw new Error(`Invalid date: ${date}`);
  }
}

/**
 * Assert that coordinates are valid (lat: -90 to 90, lng: -180 to 180)
 */
export function assertValidCoordinates(lat: number, lng: number): void {
  if (lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat}. Must be -90 to 90`);
  }
  
  if (lng < -180 || lng > 180) {
    throw new Error(`Invalid longitude: ${lng}. Must be -180 to 180`);
  }
}

/**
 * Calculate extraction statistics from parsed events
 */
export function calculateExtractionStats(results: ParsedEvent[]): ExtractionStats {
  const totalPosts = results.length;
  const postsWithDate = results.filter(r => r.eventDate !== null).length;
  const postsWithTime = results.filter(r => r.eventTime !== null).length;
  const postsWithLocation = results.filter(r => r.locationName !== null).length;
  const postsWithPrice = results.filter(r => r.price !== null).length;
  const postsWithCoordinates = results.filter(r => r.locationLat !== null && r.locationLng !== null).length;
  
  return {
    totalPosts,
    postsWithDate,
    postsWithTime,
    postsWithLocation,
    postsWithPrice,
    postsWithCoordinates,
    dateExtractionRate: totalPosts > 0 ? postsWithDate / totalPosts : 0,
    timeExtractionRate: totalPosts > 0 ? postsWithTime / totalPosts : 0,
    locationExtractionRate: totalPosts > 0 ? postsWithLocation / totalPosts : 0,
    priceExtractionRate: totalPosts > 0 ? postsWithPrice / totalPosts : 0,
    geocodingSuccessRate: postsWithLocation > 0 ? postsWithCoordinates / postsWithLocation : 0,
  };
}

/**
 * Format extraction stats as a readable string
 */
export function formatStats(stats: ExtractionStats): string {
  return `
Extraction Statistics:
----------------------
Total Posts: ${stats.totalPosts}
Posts with Date: ${stats.postsWithDate} (${(stats.dateExtractionRate * 100).toFixed(1)}%)
Posts with Time: ${stats.postsWithTime} (${(stats.timeExtractionRate * 100).toFixed(1)}%)
Posts with Location: ${stats.postsWithLocation} (${(stats.locationExtractionRate * 100).toFixed(1)}%)
Posts with Price: ${stats.postsWithPrice} (${(stats.priceExtractionRate * 100).toFixed(1)}%)
Posts with Coordinates: ${stats.postsWithCoordinates} (${(stats.geocodingSuccessRate * 100).toFixed(1)}% of locations)
  `.trim();
}

/**
 * Sample captions for testing (extracted from common event patterns)
 */
export const SAMPLE_CAPTIONS = {
  // Date extraction samples
  dateStandard: 'Join us on January 5, 2025 for an amazing event!',
  dateFilipino: 'Mangyaring dumalo sa ika-15 ng Enero',
  dateRange: 'Community market Dec 25-27 at SM North EDSA',
  dateRelative: 'Party this Friday night at 9pm',
  
  // Time extraction samples
  timeStandard: 'Event starts at 7:00 PM',
  timeFilipino: 'Magsisimula ng alas-7 ng gabi',
  time24h: 'Concert at 19:00',
  timeRange: 'Open 7pm-9pm',
  
  // Venue extraction samples
  venuePin: '📍 SM North EDSA, Quezon City',
  venueKeyword: 'Venue: The Fort, BGC',
  venueMention: '@greenbelt5',
  venueAt: 'Party at Poblacion Makati',
  venueSa: 'Punta sa Trinoma this weekend',
  
  // Vendor detection samples
  vendorStrict: 'PHP 250 per piece. DM for price. Sizes: S, M, L, XL',
  vendorSoft: 'New collection available now! Shop our boutique',
  vendorUkay: 'Ukay-ukay selling event, FB live selling',
  vendorMarket: 'Weekend market with 50+ vendors, free entry',
  
  // Price extraction samples
  priceFree: 'Free admission to all!',
  pricePHP: 'Entrance fee: PHP 500',
  priceRange: '₱299-349 per ticket',
  pricePeso: 'P1000 entrance',
};
