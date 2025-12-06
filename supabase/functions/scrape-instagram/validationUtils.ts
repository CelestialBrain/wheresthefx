/**
 * Data Validation Layer for Event Extraction
 * 
 * Validates extracted event data before database insert.
 * Logs warnings, corrects data where possible, and assigns review tiers.
 */

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  correctedData: {
    eventDate: string | null;
    eventEndDate: string | null;
    eventTime: string | null;
    endTime: string | null;
    locationName: string | null;
    price: number | null;
  };
}

export type ReviewTier = 'ready' | 'quick' | 'full' | 'rejected';

export interface TierAssignment {
  tier: ReviewTier;
  reason: string;
  extractionConfidence: number;
}

/**
 * Validates extracted event data and returns corrected values + warnings
 */
const VALID_CATEGORIES = ['nightlife', 'music', 'art_culture', 'markets', 'food', 'workshops', 'community', 'comedy', 'other'];

// Vague venue patterns that should be rejected
const VAGUE_VENUE_PATTERNS = [
  /^tba$/i,
  /^tbd$/i,
  /^to be announced$/i,
  /^check bio/i,
  /^dm for/i,
  /^message for/i,
  /^see bio/i,
  /^link in bio/i,
  /^details in bio/i,
  /^secret location/i,
  /^undisclosed/i,
  /^private location/i,
  /^location tba/i,
  /^venue tbd/i,
  /^will announce/i,
];

export function validateExtractedData(data: {
  eventDate?: string | null;
  eventEndDate?: string | null;
  eventTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  price?: number | null;
  caption?: string;
  eventTitle?: string | null;
  category?: string | null;
  isFree?: boolean | null;
}): ValidationResult & { correctedCategory?: string } {
  const warnings: string[] = [];
  const corrected = { ...data };
  
  // Use Philippine timezone (UTC+8)
  const philippineNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const today = new Date(philippineNow.toISOString().split('T')[0]);
  const currentYear = philippineNow.getUTCFullYear();

  // 1. Date validation
  if (corrected.eventDate) {
    const eventDate = new Date(corrected.eventDate);
    const oneYearFromNow = new Date(today.getFullYear() + 1, 11, 31);
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Reject dates more than 1 year in future
    if (eventDate > oneYearFromNow) {
      warnings.push('date_too_far_future');
      corrected.eventDate = null;
    }
    // Reject dates with obviously wrong years (e.g., 3008, 1999)
    else if (eventDate.getFullYear() < 2024 || eventDate.getFullYear() > currentYear + 2) {
      warnings.push('date_invalid_year');
      corrected.eventDate = null;
    }
    // Warn if date is in the past (but within a week - could be timezone issue)
    else if (eventDate < oneWeekAgo) {
      warnings.push('date_in_past');
      corrected.eventDate = null;
    }
  }

  // 2. End date validation
  if (corrected.eventEndDate && corrected.eventDate) {
    const startDate = new Date(corrected.eventDate);
    const endDate = new Date(corrected.eventEndDate);
    
    if (endDate < startDate) {
      warnings.push('end_date_before_start');
      corrected.eventEndDate = corrected.eventDate;
    }
    
    // Multi-day events shouldn't be more than 14 days (likely extraction error)
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 14) {
      warnings.push('event_duration_too_long');
      corrected.eventEndDate = corrected.eventDate;
    }
  }

  // 3. Time validation
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  
  if (corrected.eventTime && !timeRegex.test(corrected.eventTime)) {
    warnings.push('invalid_time_format');
    corrected.eventTime = null;
  }
  
  if (corrected.endTime && !timeRegex.test(corrected.endTime)) {
    warnings.push('invalid_end_time_format');
    corrected.endTime = null;
  }

  // 4. End time validation (suspicious patterns)
  if (corrected.eventTime && corrected.endTime) {
    const [startHour, startMin] = corrected.eventTime.split(':').map(Number);
    const [endHour, endMin] = corrected.endTime.split(':').map(Number);
    const startMins = startHour * 60 + startMin;
    const endMins = endHour * 60 + endMin;
    
    // If end time is earlier and it's after 6am, that's suspicious
    if (endMins < startMins && endMins > 360) { // 6am = 360 mins
      warnings.push('end_time_suspicious');
    }
  }

  // 5. Venue name validation
  if (corrected.locationName) {
    // Truncate if too long
    if (corrected.locationName.length > 100) {
      warnings.push('venue_name_truncated');
      corrected.locationName = corrected.locationName.substring(0, 100).trim();
    }
    
    // Check for garbage patterns (all caps hashtags, @mentions only, etc.)
    if (/^[@#]/.test(corrected.locationName) && !corrected.locationName.includes(' ')) {
      warnings.push('venue_looks_like_handle');
    }
    
    // Check for phone numbers mistaken as venues
    if (/^[\d\s\-+()]+$/.test(corrected.locationName.replace(/\s/g, ''))) {
      warnings.push('venue_looks_like_phone');
      corrected.locationName = null;
    }
    
    // Check for vague venue patterns (TBA, DM for location, etc.)
    const isVagueVenue = VAGUE_VENUE_PATTERNS.some(pattern => pattern.test(corrected.locationName!.trim()));
    if (isVagueVenue) {
      warnings.push('venue_vague');
      // Don't null it out - keep for reference but flag it
    }
  }

  // 6. Price validation
  if (corrected.price !== null && corrected.price !== undefined) {
    // Reject obviously wrong prices
    if (corrected.price < 0) {
      warnings.push('price_negative');
      corrected.price = null;
    } else if (corrected.price > 50000) {
      // Likely a phone number parsed as price
      warnings.push('price_too_high');
      corrected.price = null;
    } else if (corrected.price > 0 && corrected.price < 10) {
      // Suspiciously low for an event (probably extraction error)
      warnings.push('price_suspiciously_low');
    }
    
    // Check if price might be a phone number (starts with 09, has 10+ digits)
    const priceStr = String(corrected.price);
    if (priceStr.startsWith('09') || priceStr.startsWith('63') || priceStr.length >= 10) {
      warnings.push('price_looks_like_phone');
      corrected.price = null;
    }
  }

  // 7. Event title validation
  if (data.eventTitle) {
    if (data.eventTitle.length < 3) {
      warnings.push('title_too_short');
    }
    // Check for emoji-only titles
    const textWithoutEmoji = data.eventTitle.replace(/[\p{Emoji}\s]/gu, '');
    if (textWithoutEmoji.length === 0) {
      warnings.push('title_only_emoji');
    }
    // Check for excessively long titles
    if (data.eventTitle.length > 200) {
      warnings.push('title_too_long');
    }
  }

  // 8. Category validation
  let correctedCategory = data.category || 'other';
  if (data.category && !VALID_CATEGORIES.includes(data.category.toLowerCase())) {
    warnings.push('invalid_category');
    correctedCategory = 'other';
  }

  // 9. is_free/price consistency check
  if (data.isFree === false && (!data.price || data.price === 0)) {
    warnings.push('not_free_but_no_price');
  }
  if (data.isFree === true && data.price && data.price > 0) {
    warnings.push('free_but_has_price');
    // Auto-correct: if there's a price, it's probably not free
    corrected.price = data.price;
  }

  // Determine if valid (severe warnings = not valid)
  const severeWarnings = warnings.filter(w => 
    !w.includes('suspicious') && !w.includes('truncated') && !w.includes('consistency')
  );

  return {
    isValid: severeWarnings.length === 0,
    warnings,
    correctedData: {
      eventDate: corrected.eventDate || null,
      eventEndDate: corrected.eventEndDate || null,
      eventTime: corrected.eventTime || null,
      endTime: corrected.endTime || null,
      locationName: corrected.locationName || null,
      price: corrected.price ?? null,
    },
    correctedCategory,
  };
}

/**
 * Assigns a review tier based on extraction confidence and data quality
 */
export function assignReviewTier(
  aiConfidence: number | undefined,
  ocrConfidence: number | undefined,
  extractionMethod: string,
  validationWarnings: string[],
  hasDate: boolean,
  hasTime: boolean,
  hasVenue: boolean,
  hasCoordinates: boolean,
  isKnownVenue: boolean
): TierAssignment {
  
  // Calculate composite confidence
  let confidence = aiConfidence ?? 0.5;
  
  // Boost confidence for known venues (geocoded)
  if (isKnownVenue || hasCoordinates) {
    confidence = Math.min(1, confidence + 0.15);
  }
  
  // Reduce confidence for validation warnings
  const severeWarnings = validationWarnings.filter(w => 
    !w.includes('suspicious') && !w.includes('truncated')
  );
  confidence -= severeWarnings.length * 0.1;
  
  // Reduce confidence if OCR was low quality
  if (ocrConfidence !== undefined && ocrConfidence < 0.5) {
    confidence -= 0.1;
  }
  
  // Clamp confidence
  confidence = Math.max(0, Math.min(1, confidence));
  
  // Determine tier
  const coreFieldsPresent = hasDate && hasVenue;
  const allFieldsPresent = hasDate && hasTime && hasVenue;
  
  // READY tier: High confidence + all core fields + no severe warnings
  if (confidence >= 0.85 && allFieldsPresent && severeWarnings.length === 0 && hasCoordinates) {
    return {
      tier: 'ready',
      reason: `High confidence (${(confidence * 100).toFixed(0)}%) with all fields + geocoded`,
      extractionConfidence: confidence
    };
  }
  
  // QUICK tier: Good confidence + core fields
  if (confidence >= 0.65 && coreFieldsPresent && severeWarnings.length <= 1) {
    return {
      tier: 'quick',
      reason: `Good confidence (${(confidence * 100).toFixed(0)}%) - verify ${!hasTime ? 'time' : !hasCoordinates ? 'location' : 'details'}`,
      extractionConfidence: confidence
    };
  }
  
  // REJECTED tier: Very low confidence or too many issues
  if (confidence < 0.4 || severeWarnings.length >= 3) {
    return {
      tier: 'rejected',
      reason: `Low confidence (${(confidence * 100).toFixed(0)}%) or too many validation issues`,
      extractionConfidence: confidence
    };
  }
  
  // FULL tier: Everything else
  return {
    tier: 'full',
    reason: `Needs manual review - ${!hasDate ? 'missing date' : !hasVenue ? 'missing venue' : 'low confidence'}`,
    extractionConfidence: confidence
  };
}

/**
 * Checks for duplicate events in the database
 */
export async function checkForDuplicate(
  supabase: any,
  venueName: string | null,
  eventDate: string | null,
  eventTime: string | null,
  eventTitle: string | null
): Promise<{ isDuplicate: boolean; duplicateOfId: string | null }> {
  
  if (!eventDate || !venueName) {
    return { isDuplicate: false, duplicateOfId: null };
  }
  
  try {
    // Sanitize venue name for ILIKE
    const sanitizedVenue = venueName.substring(0, 30).replace(/[%_]/g, '');
    
    // Check for existing event at same venue on same date
    const { data: existingEvents } = await supabase
      .from('instagram_posts')
      .select('id, event_title, event_time')
      .eq('event_date', eventDate)
      .eq('is_event', true)
      .eq('is_duplicate', false)
      .ilike('location_name', `%${sanitizedVenue}%`)
      .limit(5);
    
    if (!existingEvents || existingEvents.length === 0) {
      return { isDuplicate: false, duplicateOfId: null };
    }
    
    // Check time proximity (within 2 hours)
    for (const existing of existingEvents) {
      if (eventTime && existing.event_time) {
        const newHour = parseInt(eventTime.split(':')[0], 10);
        const existingHour = parseInt(existing.event_time.split(':')[0], 10);
        
        if (Math.abs(newHour - existingHour) <= 2) {
          return { isDuplicate: true, duplicateOfId: existing.id };
        }
      } else {
        // No time to compare - same venue/date is likely duplicate
        return { isDuplicate: true, duplicateOfId: existing.id };
      }
    }
    
    return { isDuplicate: false, duplicateOfId: null };
  } catch (err) {
    console.error('Duplicate check failed:', err);
    return { isDuplicate: false, duplicateOfId: null };
  }
}

/**
 * Logs validation warnings to the validation_logs table
 */
export async function logValidationWarnings(
  supabase: any,
  postId: string,
  warnings: string[],
  originalData: Record<string, any>
): Promise<void> {
  if (warnings.length === 0) return;
  
  try {
    const logs = warnings.map(warning => {
      // Extract field name from warning type
      const fieldMatch = warning.match(/^(date|time|end_date|end_time|venue|price)/);
      const fieldName = fieldMatch ? fieldMatch[1] : null;
      
      return {
        instagram_post_id: postId,
        warning_type: warning,
        field_name: fieldName,
        original_value: fieldName && originalData[fieldName] ? String(originalData[fieldName]) : null,
      };
    });
    
    await supabase.from('validation_logs').insert(logs);
  } catch (err) {
    console.error('Failed to log validation warnings:', err);
  }
}
