/**
 * Context Builder for AI-Powered Event Extraction
 * 
 * This module builds rich context for AI extraction by querying:
 * - Past corrections from extraction_corrections table
 * - Known venues from known_venues table
 * - Account venue statistics from account_venue_stats table
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Similar correction from past user edits
 */
interface SimilarCorrection {
  original: string;
  corrected: string;
  field: string;
}

/**
 * Known venue from database
 */
interface KnownVenue {
  name: string;
  aliases: string[];
  address: string | null;
}

/**
 * Account's usual venue with frequency
 */
interface AccountUsualVenue {
  venue: string;
  frequency: number;
}

/**
 * Rich context for AI extraction
 */
export interface AIContext {
  // Raw data (required)
  caption: string;
  locationHint: string | null;
  postedAt: string | null;
  ownerUsername: string | null;
  
  // Smart context (from database)
  similarCorrections: SimilarCorrection[];
  knownVenues: KnownVenue[];
  accountUsualVenues: AccountUsualVenue[];
}

/**
 * Raw input data for context building
 */
export interface RawInputData {
  caption: string;
  locationHint?: string | null;
  postedAt?: string | null;
  ownerUsername?: string | null;
  instagramAccountId?: string | null;
}

/**
 * Extract potential venue keywords from caption
 * Looks for:
 * - Text after 📍 emoji
 * - Text after "at" or "sa" (Filipino for "at")
 * - @mentions
 */
function extractVenueKeywords(caption: string): string[] {
  const keywords: string[] = [];
  
  // Extract text after 📍 emoji (up to newline or 50 chars)
  const pinEmojiMatch = caption.match(/📍\s*([^\n]{1,50})/);
  if (pinEmojiMatch && pinEmojiMatch[1]) {
    keywords.push(pinEmojiMatch[1].trim());
  }
  
  // Extract text after "at" or "sa" (case insensitive)
  // Using more permissive pattern to capture venues starting with lowercase/numbers
  const atPatterns = [
    /\bat\s+([a-zA-Z0-9@][a-zA-Z0-9\s@_.]+?)(?=[\n,.]|$)/gi,
    /\bsa\s+([a-zA-Z0-9@][a-zA-Z0-9\s@_.]+?)(?=[\n,.]|$)/gi,
  ];
  
  for (const pattern of atPatterns) {
    let match;
    while ((match = pattern.exec(caption)) !== null) {
      if (match[1] && match[1].trim().length >= 3) {
        keywords.push(match[1].trim());
      }
    }
  }
  
  // Extract @mentions (potential venue handles)
  const mentionMatches = caption.match(/@[a-zA-Z0-9_.]+/g);
  if (mentionMatches) {
    keywords.push(...mentionMatches.map(m => m.toLowerCase()));
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Sanitize string for use in ilike filter to prevent SQL injection
 * Escapes special characters: %, _, \
 */
function sanitizeForIlike(str: string): string {
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent
    .replace(/_/g, '\\_');   // Escape underscore
}

/**
 * Query similar corrections from extraction_corrections table
 */
async function getSimilarCorrections(
  keywords: string[],
  supabase: SupabaseClient
): Promise<SimilarCorrection[]> {
  if (keywords.length === 0) {
    return [];
  }

  try {
    // Build OR conditions for trigram similarity search
    const corrections: SimilarCorrection[] = [];
    
    for (const keyword of keywords.slice(0, 5)) { // Limit to 5 keywords
      // Sanitize keyword to prevent SQL injection
      const sanitizedKeyword = sanitizeForIlike(keyword);
      const { data, error } = await supabase
        .from('extraction_corrections')
        .select('original_extracted_value, corrected_value, field_name')
        .or(`original_extracted_value.ilike.%${sanitizedKeyword}%,corrected_value.ilike.%${sanitizedKeyword}%`)
        .limit(5);
      
      if (error) {
        console.error('Error fetching corrections:', error.message);
        continue;
      }
      
      if (data) {
        for (const row of data) {
          if (row.original_extracted_value && row.corrected_value) {
            corrections.push({
              original: row.original_extracted_value,
              corrected: row.corrected_value,
              field: row.field_name,
            });
          }
        }
      }
    }
    
    // Remove duplicates based on original+corrected
    const seen = new Set<string>();
    return corrections.filter(c => {
      const key = `${c.original}:${c.corrected}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10); // Limit to 10 corrections
  } catch (error) {
    console.error('Error in getSimilarCorrections:', error);
    return [];
  }
}

/**
 * Query known venues matching keywords
 */
async function getKnownVenues(
  keywords: string[],
  locationHint: string | null,
  supabase: SupabaseClient
): Promise<KnownVenue[]> {
  try {
    const searchTerms = [...keywords];
    if (locationHint) {
      searchTerms.push(locationHint);
    }
    
    if (searchTerms.length === 0) {
      return [];
    }

    const venues: KnownVenue[] = [];
    
    for (const term of searchTerms.slice(0, 5)) { // Limit to 5 search terms
      // Sanitize term to prevent SQL injection
      const sanitizedTerm = sanitizeForIlike(term);
      const { data, error } = await supabase
        .from('known_venues')
        .select('name, aliases, address')
        .or(`name.ilike.%${sanitizedTerm}%,aliases.cs.{${sanitizedTerm}}`)
        .limit(5);
      
      if (error) {
        console.error('Error fetching known venues:', error.message);
        continue;
      }
      
      if (data) {
        for (const row of data) {
          venues.push({
            name: row.name,
            aliases: row.aliases || [],
            address: row.address,
          });
        }
      }
    }
    
    // Remove duplicates based on name
    const seen = new Set<string>();
    return venues.filter(v => {
      if (seen.has(v.name)) return false;
      seen.add(v.name);
      return true;
    }).slice(0, 10); // Limit to 10 venues
  } catch (error) {
    console.error('Error in getKnownVenues:', error);
    return [];
  }
}

/**
 * Query account's usual venues from account_venue_stats
 */
async function getAccountUsualVenues(
  instagramAccountId: string | null,
  supabase: SupabaseClient
): Promise<AccountUsualVenue[]> {
  if (!instagramAccountId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('account_venue_stats')
      .select('venue_name, post_count')
      .eq('instagram_account_id', instagramAccountId)
      .order('post_count', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('Error fetching account venue stats:', error.message);
      return [];
    }
    
    if (!data) {
      return [];
    }
    
    return data.map(row => ({
      venue: row.venue_name,
      frequency: row.post_count,
    }));
  } catch (error) {
    console.error('Error in getAccountUsualVenues:', error);
    return [];
  }
}

/**
 * Build rich AI context from raw input data
 * 
 * @param rawData - Raw input data (caption, location hint, etc.)
 * @param supabase - Supabase client for database queries
 * @returns AIContext with smart context from database
 */
export async function buildAIContext(
  rawData: RawInputData,
  supabase: SupabaseClient
): Promise<AIContext> {
  // Extract venue keywords from caption
  const venueKeywords = extractVenueKeywords(rawData.caption);
  
  // Query database for context in parallel
  const [similarCorrections, knownVenues, accountUsualVenues] = await Promise.all([
    getSimilarCorrections(venueKeywords, supabase),
    getKnownVenues(venueKeywords, rawData.locationHint || null, supabase),
    getAccountUsualVenues(rawData.instagramAccountId || null, supabase),
  ]);
  
  return {
    caption: rawData.caption,
    locationHint: rawData.locationHint || null,
    postedAt: rawData.postedAt || null,
    ownerUsername: rawData.ownerUsername || null,
    similarCorrections,
    knownVenues,
    accountUsualVenues,
  };
}

// Export types for use in other modules
export type { SimilarCorrection, KnownVenue, AccountUsualVenue };
