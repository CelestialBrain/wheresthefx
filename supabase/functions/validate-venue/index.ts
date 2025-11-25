import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeResponse {
  lat?: number;
  lng?: number;
  formatted_address?: string;
  confidence?: 'high' | 'medium' | 'low' | number;
}

/**
 * Venue alias configuration for canonicalizing venue names before geocoding
 * Key: lowercase alias (what might appear in captions)
 * Value: { canonical: normalized name, context?: optional address substring to match }
 */
const VENUE_ALIASES: Record<string, { canonical: string; context?: string }> = {
  'the victor art installation': { canonical: 'The Victor', context: 'Bridgetowne' },
  'victor art installation': { canonical: 'The Victor', context: 'Bridgetowne' },
  'the victor bridgetowne': { canonical: 'The Victor', context: 'Pasig' },
  // Add more aliases as needed
};

/**
 * Strips emojis from a string
 */
function stripEmojis(text: string): string {
  // Remove emoji-like characters using a broad Unicode range approach
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Miscellaneous Symbols and Pictographs, Emoticons, etc.
    .replace(/[\u{2600}-\u{27BF}]/gu, '')   // Miscellaneous symbols
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation selectors
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Extended symbols and pictographs
    .replace(/[\u{231A}\u{231B}]/gu, '')    // Watch, hourglass
    .replace(/[\u{23E9}-\u{23FA}]/gu, '')   // Media control symbols
    .replace(/[\u{25AA}-\u{25FE}]/gu, '')   // Geometric shapes
    .trim();
}

/**
 * Normalizes an address by:
 * - Stripping emojis
 * - Removing @handles
 * - Removing sponsor text
 */
function normalizeAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null;
  
  let cleaned = address.trim();
  
  // Strip emojis
  cleaned = stripEmojis(cleaned);
  
  // Remove @handles
  cleaned = cleaned.replace(/@[\w.]+/g, '').trim();
  
  // Remove sponsor text and everything after it
  const sponsorPatterns = [
    /\s*Made possible by:.*$/i,
    /\s*Powered by:?.*$/i,
    /\s*Sponsored by:?.*$/i,
    /\s*Presented by:?.*$/i,
    /\s*In partnership with:?.*$/i,
  ];
  
  for (const pattern of sponsorPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.,!?;:]+$/, '').trim();
  
  if (cleaned.length < 3) {
    return null;
  }
  
  return cleaned;
}

/**
 * Canonicalizes a venue name using the alias configuration.
 */
function canonicalizeVenueName(
  venueName: string | null | undefined,
  address?: string | null
): { canonical: string | null; wasAliased: boolean } {
  if (!venueName) return { canonical: null, wasAliased: false };
  
  const lowerName = venueName.toLowerCase().trim();
  const alias = VENUE_ALIASES[lowerName];
  
  if (alias) {
    // If alias has a context requirement, check the address
    if (alias.context) {
      const lowerAddress = (address || '').toLowerCase();
      if (lowerAddress.includes(alias.context.toLowerCase())) {
        return { canonical: alias.canonical, wasAliased: true };
      }
    } else {
      return { canonical: alias.canonical, wasAliased: true };
    }
  }
  
  return { canonical: venueName, wasAliased: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue, address } = await req.json();
    
    if (!venue) {
      return new Response(
        JSON.stringify({ error: 'Venue name is required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize the address first
    const normalizedAddress = normalizeAddress(address);
    
    // Apply venue aliasing/canonicalization
    const { canonical: canonicalVenue, wasAliased } = canonicalizeVenueName(venue, normalizedAddress || address);
    const venueToGeocode = canonicalVenue || venue;
    
    console.log(`Validating venue: ${venue}${wasAliased ? ` (canonicalized to: ${venueToGeocode})` : ''}`);
    if (normalizedAddress !== address) {
      console.log(`Address normalized from "${address}" to "${normalizedAddress}"`);
    }

    // Construct search query - use normalized/canonical values
    const searchQuery = normalizedAddress ? `${venueToGeocode}, ${normalizedAddress}` : venueToGeocode;
    
    console.log(`Geocoding query: ${searchQuery}`);

    // Call geocode-location function to validate and get coordinates
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const geocodeResponse = await fetch(`${supabaseUrl}/functions/v1/geocode-location`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locationName: searchQuery }),
    });

    if (!geocodeResponse.ok) {
      console.error('Geocoding failed:', await geocodeResponse.text());
      return new Response(
        JSON.stringify({ 
          isValid: false,
          error: 'Geocoding service unavailable',
          rawVenue: venue,
          canonicalVenue: wasAliased ? venueToGeocode : undefined,
          rawAddress: address,
          normalizedAddress: normalizedAddress !== address ? normalizedAddress : undefined,
        }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geocodeData: GeocodeResponse = await geocodeResponse.json();
    
    // Consider valid if we got coordinates
    const isValid = !!(geocodeData.lat && geocodeData.lng);
    
    return new Response(JSON.stringify({
      isValid,
      lat: geocodeData.lat || null,
      lng: geocodeData.lng || null,
      formattedAddress: geocodeData.formatted_address || null,
      confidence: geocodeData.confidence || 0.5,
      // Include aliasing info for debugging
      rawVenue: venue,
      canonicalVenue: wasAliased ? venueToGeocode : undefined,
      rawAddress: address,
      normalizedAddress: normalizedAddress !== address ? normalizedAddress : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Venue validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        isValid: false,
        error: errorMessage
      }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
