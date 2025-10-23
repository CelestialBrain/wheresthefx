import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface for Apify dataset items
interface ApifyDatasetItem {
  id?: string;
  shortCode?: string;
  type?: 'Sidecar' | 'Image' | 'Video';
  caption?: string;
  commentsCount?: number;
  likesCount?: number;
  timestamp?: string;
  locationName?: string | null;
  ownerFullName?: string;
  ownerUsername?: string;
  ownerId?: string;
  url?: string;
  inputUrl?: string;
  displayUrl?: string;  // Direct CDN image URL (primary)
  imageUrl?: string;    // Alternative image URL field
  hashtags?: string[];
  mentions?: string[];
  error?: string;
  errorDescription?: string;
  childPosts?: any[];
}

// Extract dataset ID and token from input
function parseDatasetInput(input: string): { datasetId: string; token: string | undefined } {
  const datasetMatch = input.match(/datasets\/([a-zA-Z0-9]+)/);
  const datasetId = datasetMatch ? datasetMatch[1] : input.trim();
  
  const tokenMatch = input.match(/[?&]token=([^&]+)/);
  const token = tokenMatch ? tokenMatch[1] : undefined;
  
  return { datasetId, token };
}

// Extract username from Instagram URL
function extractUsernameFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/instagram\.com\/([^/?]+)/);
  if (!match) return undefined;
  let username = decodeURIComponent(match[1]).trim().toLowerCase();
  if (username.startsWith('@')) username = username.slice(1);
  return username || undefined;
}

// Parse and normalize date to YYYY-MM-DD format
function parseAndNormalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const currentYear = new Date().getFullYear();
  const today = new Date();
  
  // If already in YYYY-MM-DD format, validate and return
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr);
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
      return date.toISOString().split('T')[0];
    }
    return dateStr;
  }
  
  // Handle "Month Day" or "Month Day, Year" formats
  const monthDayYearMatch = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?/i);
  if (monthDayYearMatch) {
    const monthStr = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i)?.[0].toLowerCase();
    const monthMap: { [key: string]: number } = {
      january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
      april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
      august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
      november: 10, nov: 10, december: 11, dec: 11
    };
    
    if (monthStr && monthMap[monthStr] !== undefined) {
      const day = parseInt(monthDayYearMatch[1]);
      let year = monthDayYearMatch[2] ? parseInt(monthDayYearMatch[2]) : currentYear;
      
      const date = new Date(year, monthMap[monthStr], day);
      
      // If date is in the past by more than 30 days, assume next year
      if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
        date.setFullYear(currentYear + 1);
      }
      
      return date.toISOString().split('T')[0];
    }
  }
  
  // Handle MM/DD or MM/DD/YYYY formats
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = slashMatch[3] ? parseInt(slashMatch[3]) : currentYear;
    if (year < 100) year += 2000; // Handle 2-digit years
    
    const date = new Date(year, month, day);
    
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
    }
    
    return date.toISOString().split('T')[0];
  }
  
  // Handle DD-MM-YYYY formats
  const dashMatch = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1]);
    const month = parseInt(dashMatch[2]) - 1;
    let year = parseInt(dashMatch[3]);
    if (year < 100) year += 2000;
    
    const date = new Date(year, month, day);
    
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
    }
    
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

// Convert relative date terms to actual dates with improved year detection
function parseRelativeDate(text: string): string | null {
  const now = new Date();
  const lowercaseText = text.toLowerCase();
  
  if (lowercaseText.includes('tonight') || lowercaseText.includes('today')) {
    return now.toISOString().split('T')[0];
  }
  
  if (lowercaseText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  if (lowercaseText.includes('this weekend')) {
    const dayOfWeek = now.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysUntilFriday);
    return friday.toISOString().split('T')[0];
  }
  
  return null;
}

// Validate time format (must be HH:MM with valid hours 0-23, minutes 0-59)
function isValidTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return false;
  
  const hour = parseInt(parts[0]);
  const minute = parseInt(parts[1]);
  
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

// Enhanced event parser with improved detection
function parseEventFromCaption(caption: string, locationName?: string | null): {
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  locationName?: string;
  locationAddress?: string;
  signupUrl?: string;
  isEvent: boolean;
  timeValidationFailed?: boolean;
} {
  if (!caption) {
    return { isEvent: false };
  }

  const lowercaseCaption = caption.toLowerCase();
  
  // STEP 1: Check for exclusion patterns (skip generic celebrations)
  const exclusionPatterns = [
    /happy\s+birthday(?!\s+(party|celebration|bash|event))/i,
    /#tbt\b/i,
    /#throwback/i,
    /thank\s+you\s+(to|for)/i,
    /congratulations(?!\s+on\s+.*?\s+(opening|launch|event))/i,
    /welcome\s+to\s+the\s+team/i,
  ];
  
  for (const pattern of exclusionPatterns) {
    if (pattern.test(caption)) {
      // Unless it's an anniversary with a date and location
      const hasAnniversary = /anniversary/i.test(caption);
      if (hasAnniversary) {
        // Check if there's a date
        const datePatterns = [
          /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
          /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/,
          /(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
          /\d{1,2}-\d{1,2}-\d{2,4}/,
        ];
        const hasDate = datePatterns.some(p => p.test(caption));
        const hasLocation = locationName || /(?:at|@|location:|venue:|place:)\s*([^\n,]+)/i.test(caption);
        
        if (!hasDate || !hasLocation) {
          return { isEvent: false };
        }
        // Continue to event parsing
      } else {
        return { isEvent: false };
      }
    }
  }
  
  // STEP 2: Check for event indicators (expanded and more permissive)
  const eventKeywords = [
    'party', 'event', 'happening', 'tonight', 'tomorrow', 'this weekend',
    'join us', 'rsvp', 'free entry', 'entrance', 'tickets', 'doors open',
    'gig', 'concert', 'show', 'performance', 'dj', 'live music',
    'workshop', 'seminar', 'meetup', 'gathering', 'celebration',
    'anniversary', 'opening', 'launch', 'festival', 'market',
    'book now', 'reservations', 'save the date', 'see you', 'come by',
    'drop by', 'visit us', 'limited slots', 'register', 'sign up',
    'admission', 'cover charge', 'entry fee', 'open to public'
  ];
  const hasEventKeyword = eventKeywords.some(keyword => lowercaseCaption.includes(keyword));

  if (!hasEventKeyword) {
    return { isEvent: false };
  }

  // STEP 3: Extract location with pin emoji priority and street detection
  let extractedLocation: string | undefined;
  let extractedAddress: string | undefined;
  
  // Priority 1: Pin emoji (📍) - most explicit indicator
  const pinEmojiPattern = /📍\s*([^\n]+)/;
  const pinMatch = caption.match(pinEmojiPattern);
  if (pinMatch) {
    const locationText = pinMatch[1].trim();
    // Split by comma to separate venue from address
    const parts = locationText.split(',').map(p => p.trim());
    extractedLocation = parts[0];
    if (parts.length > 1) {
      extractedAddress = parts.slice(1).join(', ');
    }
  }
  
  // Priority 2: Traditional keywords (at/location:/venue:)
  if (!extractedLocation) {
    const locationPattern = /(?:at|@|location:|venue:|place:)\s*([^\n,]+)/i;
    const locationMatch = caption.match(locationPattern);
    extractedLocation = locationMatch?.[1]?.trim();
  }
  
  // Priority 3: Street name detection (Filipino patterns)
  if (!extractedAddress && !extractedLocation) {
    // Common Filipino street patterns
    const streetPatterns = [
      /\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Boulevard|Blvd\.))?/,
      /(?:Katipunan|Tomas Morato|Jupiter|Makati|Bonifacio|Quezon|Maginhawa|Morato|Timog|Ortigas|EDSA|Ayala|Roxas|Aguirre|Esteban|Loyola|Panay|Kalayaan)\s+(?:Avenue|Ave\.|Street|St\.|Road|Rd\.)?/i,
      /\b\d+(?:F|\/F|nd Floor|rd Floor|th Floor)\s+[A-Z][a-z]+/,
    ];
    
    for (const pattern of streetPatterns) {
      const streetMatch = caption.match(pattern);
      if (streetMatch) {
        extractedAddress = streetMatch[0].trim();
        // Try to find venue name before or after the address
        const lines = caption.split('\n');
        for (const line of lines) {
          if (line.includes(extractedAddress)) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length > 1 && parts[0] !== extractedAddress) {
              extractedLocation = parts[0];
            }
            break;
          }
        }
        break;
      }
    }
  }
  
  // Priority 4: Instagram locationName metadata
  const finalLocation = extractedLocation || locationName;

  // STEP 4: Extract event details
  const lines = caption.split('\n').filter(line => line.trim());
  const eventTitle = lines[0]?.substring(0, 100) || undefined;

  // Extract URLs (signup links)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = caption.match(urlRegex);
  const signupUrl = urls?.[0];

  // Enhanced date patterns
  const datePatterns = [
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
    /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/,
    /(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
    /\d{1,2}-\d{1,2}-\d{2,4}/,
  ];
  
  let eventDate: string | undefined;
  for (const pattern of datePatterns) {
    const match = caption.match(pattern);
    if (match) {
      // Normalize the date to YYYY-MM-DD format
      const normalizedDate = parseAndNormalizeDate(match[0]);
      if (normalizedDate) {
        eventDate = normalizedDate;
        break;
      }
    }
  }
  
  // Handle relative dates
  if (!eventDate) {
    const relativeDate = parseRelativeDate(caption);
    if (relativeDate) {
      eventDate = relativeDate;
    }
  }

  // Enhanced time patterns and normalization with validation
  const timePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/gi;
  const timeMatches = caption.matchAll(timePattern);
  let eventTime: string | undefined;
  let timeValidationFailed = false;
  
  for (const match of timeMatches) {
    const hour = parseInt(match[1]);
    const minute = parseInt(match[2] || '00');
    const period = match[3]?.toUpperCase();
    
    // Validate minute first
    if (minute > 59) {
      console.log(`Invalid minute detected: ${minute}`);
      timeValidationFailed = true;
      continue;
    }
    
    // Normalize to HH:MM format
    let normalizedHour = hour;
    if (period === 'PM' && hour !== 12) {
      normalizedHour = hour + 12;
    } else if (period === 'AM' && hour === 12) {
      normalizedHour = 0;
    } else if (!period && hour > 12 && hour < 24) {
      // Already 24-hour format
      normalizedHour = hour;
    } else if (!period && hour <= 12) {
      // Assume PM for nightlife context (after 6PM is common)
      normalizedHour = hour >= 6 ? hour : hour + 12;
    } else if (hour >= 24) {
      console.log(`Invalid hour detected: ${hour}`);
      timeValidationFailed = true;
      continue;
    }
    
    const candidateTime = `${normalizedHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    // Final validation check
    if (isValidTime(candidateTime)) {
      eventTime = candidateTime;
      break; // Take first valid time
    } else {
      timeValidationFailed = true;
    }
  }

  // Consider it an event if we have event keywords + (date OR location)
  const hasMinimumInfo = !!(finalLocation || eventDate);
  
  return {
    eventTitle,
    eventDate,
    eventTime: timeValidationFailed ? undefined : eventTime, // Set to undefined if validation failed
    locationName: finalLocation || undefined,
    locationAddress: extractedAddress || undefined,
    signupUrl,
    isEvent: hasMinimumInfo,
    timeValidationFailed, // Flag for needs_review
  };
}

// Check if event date is in the past
function isEventInPast(eventDateStr: string | undefined): boolean {
  if (!eventDateStr) return false;
  
  try {
    const eventDate = new Date(eventDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let runId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apifyApiKeySecret = Deno.env.get('APIFY_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: { datasetId?: string; automated?: boolean; forceImport?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const rawDatasetInput = body.datasetId;
    const isAutomated = body.automated || false;
    const forceImport = body.forceImport || false; // New flag for permissive dataset imports
    
    let datasetId: string | undefined;
    let datasetToken: string | undefined;
    
    if (rawDatasetInput) {
      const parsed = parseDatasetInput(rawDatasetInput);
      datasetId = parsed.datasetId;
      datasetToken = parsed.token;
    }

    // Determine which token to use
    let finalToken: string | undefined;
    if (datasetToken) {
      finalToken = datasetToken;
      console.log('Using token from dataset URL');
    } else if (apifyApiKeySecret) {
      finalToken = apifyApiKeySecret;
      console.log('Using APIFY_API_KEY secret');
    }

    if (datasetId && !finalToken) {
      return new Response(
        JSON.stringify({ 
          error: 'No Apify token available. Either include token=... in the dataset URL or set APIFY_API_KEY in backend secrets.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine run type
    const runType = datasetId ? 'manual_dataset' : (isAutomated ? 'automated' : 'manual_scrape');

    // Create scrape run record
    const { data: scrapeRun, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        run_type: runType,
        dataset_id: datasetId,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to create scrape run record:', runError);
    }

    runId = scrapeRun?.id;

    console.log(`Starting Instagram data import... Run ID: ${runId}, Type: ${runType}`);

    let totalScrapedPosts = 0;
    let totalUpdatedPosts = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const failureReasons: { [key: string]: number } = {};
    const accountsFound = new Set<string>();

    // MODE 1: Dataset Import
    if (datasetId && finalToken) {
      console.log(`Fetching data from dataset: ${datasetId}`);
      
      const apifyResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalToken}&clean=1`
      );

      if (!apifyResponse.ok) {
        const errorMsg = `Failed to fetch dataset (${apifyResponse.status}): ${apifyResponse.statusText}`;
        console.error(errorMsg);
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        throw new Error(errorMsg);
      }

      const apifyData: ApifyDatasetItem[] = await apifyResponse.json();
      console.log(`Dataset returned ${apifyData.length} items`);

      // Process each item
      for (const item of apifyData) {
        // Skip error items
        if (item.error || item.errorDescription) {
          totalSkipped++;
          console.log(`Skipping error item: ${item.error || item.errorDescription}`);
          continue;
        }

        // Skip if no ID or shortCode
        if (!item.id && !item.shortCode) {
          totalSkipped++;
          console.log('Skipping item without ID or shortCode');
          continue;
        }

        const postId = item.id || item.shortCode || 'unknown';

        // Resolve username
        let username = item.ownerUsername?.trim().toLowerCase();
        if (!username) {
          username = extractUsernameFromUrl(item.inputUrl || item.url || '');
        }
        if (!username) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - no username found`);
          continue;
        }

        accountsFound.add(username);

        // Normalize fields
        const likesCount = (item.likesCount === -1 || !item.likesCount) ? 0 : item.likesCount;
        const commentsCount = item.commentsCount || 0;
        const postedAt = item.timestamp;
        
        if (!postedAt) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - no timestamp`);
          continue;
        }

        const hashtags = item.hashtags || [];
        const mentions = item.mentions || [];
        const postUrl = item.url || `https://www.instagram.com/p/${item.shortCode}/`;

        // Parse event information
        const eventInfo = parseEventFromCaption(item.caption || '', item.locationName);

        // Skip non-events (unless force import)
        if (!eventInfo.isEvent && !forceImport) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - not an event. Caption: "${item.caption?.substring(0, 100)}..."`);
          continue;
        }

        // Note: We don't filter by past event dates during import
        // The OCR will extract the actual event date from the image
        // Past posts may still have future events advertised in them

        console.log(`Processing event: ${postId}, Date: ${eventInfo.eventDate || 'TBD'}, Time: ${eventInfo.eventTime || 'TBD'}, Location: ${eventInfo.locationName || 'TBD'}`);

        // Ensure account exists
        let { data: account } = await supabase
          .from('instagram_accounts')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (!account) {
          console.log(`Creating new account for @${username}`);
          const { data: newAccount, error: createError } = await supabase
            .from('instagram_accounts')
            .insert({
              username: username,
              display_name: item.ownerFullName,
              is_active: true,
              last_scraped_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (createError) {
            console.error(`Failed to create account ${username}:`, createError.message);
            continue;
          }
          account = newAccount;
        } else {
          // Update existing account
          await supabase
            .from('instagram_accounts')
            .update({
              display_name: item.ownerFullName,
              last_scraped_at: new Date().toISOString(),
            })
            .eq('id', account.id);
        }

        // Check if post exists
        const { data: existingPost } = await supabase
          .from('instagram_posts')
          .select('id, caption, image_url, event_date, event_time, location_name, location_address')
          .eq('post_id', postId)
          .maybeSingle();

        if (existingPost) {
          // Always backfill missing image_url
          const imageUrl = item.displayUrl || item.imageUrl;
          if (!existingPost.image_url && imageUrl) {
            await supabase
              .from('instagram_posts')
              .update({ image_url: imageUrl })
              .eq('id', existingPost.id);
            console.log(`Backfilled image_url for post ${postId}`);
          }
          
          // Check if caption changed (indicating potential update)
          if (existingPost.caption !== item.caption) {
            const newEventInfo = parseEventFromCaption(item.caption || '', item.locationName);
            
            // Only update if new event info is valid
            if (newEventInfo.isEvent && newEventInfo.eventDate && newEventInfo.locationName) {
              await supabase
                .from('instagram_posts')
                .update({
                  caption: item.caption,
                  event_date: newEventInfo.eventDate,
                  event_time: newEventInfo.eventTime,
                  location_name: newEventInfo.locationName,
                  location_address: newEventInfo.locationAddress,
                  likes_count: likesCount,
                  comments_count: commentsCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingPost.id);
              
              totalUpdatedPosts++;
              console.log(`Updated post ${postId} with new event info`);
            } else {
              // Just update engagement metrics
              await supabase
                .from('instagram_posts')
                .update({
                  likes_count: likesCount,
                  comments_count: commentsCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingPost.id);
              
              totalUpdatedPosts++;
              console.log(`Updated post ${postId} engagement only`);
            }
          } else {
            console.log(`Post ${postId} already exists, no changes`);
          }
          continue;
        }

        // Check for duplicate events (same location, date within 1 day)
        if (eventInfo.eventDate && eventInfo.locationName) {
          const eventDateObj = new Date(eventInfo.eventDate);
          const dayBefore = new Date(eventDateObj);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dayAfter = new Date(eventDateObj);
          dayAfter.setDate(dayAfter.getDate() + 1);

          const { data: similarEvents } = await supabase
            .from('instagram_posts')
            .select('id, post_id, event_title, likes_count')
            .eq('location_name', eventInfo.locationName)
            .gte('event_date', dayBefore.toISOString().split('T')[0])
            .lte('event_date', dayAfter.toISOString().split('T')[0])
            .eq('is_event', true);

          if (similarEvents && similarEvents.length > 0) {
            console.log(`Found ${similarEvents.length} similar event(s) for post ${postId}, checking for duplicates`);
            
            // If this is likely a duplicate, link them in event_groups
            for (const similar of similarEvents) {
              if (similar.post_id !== postId) {
                // Check if already in a group
                const { data: existingGroup } = await supabase
                  .from('event_groups')
                  .select('*')
                  .or(`primary_post_id.eq.${similar.id},merged_post_ids.cs.{${similar.id}}`)
                  .maybeSingle();

                if (existingGroup) {
                  // Add to existing group
                  const updatedMergedIds = [...(existingGroup.merged_post_ids || [])];
                  if (!updatedMergedIds.includes(postId)) {
                    updatedMergedIds.push(postId);
                    await supabase
                      .from('event_groups')
                      .update({ merged_post_ids: updatedMergedIds })
                      .eq('id', existingGroup.id);
                    console.log(`Added post ${postId} to existing event group`);
                  }
                } else {
                  // Create new group with the higher engagement post as primary
                  const primaryId = likesCount > similar.likes_count ? postId : similar.post_id;
                  const mergedId = likesCount > similar.likes_count ? similar.post_id : postId;
                  
                  await supabase
                    .from('event_groups')
                    .insert({
                      primary_post_id: primaryId,
                      merged_post_ids: [mergedId]
                    });
                  console.log(`Created new event group for posts ${primaryId} and ${mergedId}`);
                }
              }
            }
          }
        }

        // Determine if post needs review (missing critical info or time validation failed)
        const needsReview = forceImport || !eventInfo.eventDate || !eventInfo.eventTime || !eventInfo.locationName || eventInfo.timeValidationFailed;

        // Extract image URL from Apify data (displayUrl or imageUrl)
        const imageUrl = item.displayUrl || item.imageUrl;

        // Prepare insert data - allow NULL for missing data
        const insertData: any = {
          post_id: postId,
          instagram_account_id: account.id,
          caption: item.caption,
          post_url: postUrl,
          image_url: imageUrl,
          posted_at: postedAt,
          likes_count: likesCount,
          comments_count: commentsCount,
          hashtags: hashtags,
          mentions: mentions,
          is_event: eventInfo.isEvent || forceImport,
          event_title: eventInfo.eventTitle,
          event_date: eventInfo.eventDate || null, // Allow null for TBD dates
          location_name: eventInfo.locationName,
          location_address: eventInfo.locationAddress,
          signup_url: eventInfo.signupUrl,
          needs_review: needsReview,
        };

        // Only add event_time if we have a valid value
        if (eventInfo.eventTime && !eventInfo.timeValidationFailed) {
          insertData.event_time = eventInfo.eventTime;
        }

        // Insert new post with error handling
        try {
          const { data: insertedPost, error: insertError } = await supabase
            .from('instagram_posts')
            .insert(insertData)
            .select()
            .single();

          if (insertError) {
            console.error(`Failed to insert post ${postId}:`, insertError.message, insertError);
            totalFailed++;
            const reason = insertError.code || 'unknown_error';
            failureReasons[reason] = (failureReasons[reason] || 0) + 1;
            continue;
          }

          totalScrapedPosts++;
          console.log(`✓ Inserted post ${postId}${needsReview ? ' (needs review)' : ''}`);

          // If needs review, trigger OCR enrichment
          if (needsReview && insertedPost && imageUrl) {
            console.log(`Triggering OCR enrichment for post ${insertedPost.id}`);
            
            try {
              await supabase.functions.invoke('enrich-post-ocr', {
                body: { postId: insertedPost.id }
              });
            } catch (ocrError) {
              console.error(`OCR enrichment failed for ${insertedPost.id}:`, ocrError);
              // Don't fail the entire import if OCR fails
            }
          }
        } catch (unexpectedError) {
          console.error(`Unexpected error inserting post ${postId}:`, unexpectedError);
          totalFailed++;
          failureReasons['unexpected_error'] = (failureReasons['unexpected_error'] || 0) + 1;
        }
      }

    } else {
      // MODE 2 & 3: Manual or Automated Scraping
      if (!apifyApiKeySecret) {
        throw new Error('APIFY_API_KEY secret not configured. Please add it in backend settings.');
      }

      // Get active Instagram accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('is_active', true);

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      if (!accounts || accounts.length === 0) {
        console.log('No active Instagram accounts configured');
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        return new Response(
          JSON.stringify({ message: 'No active accounts configured', newPostsAdded: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found ${accounts.length} active accounts to scrape`);

      // Calculate 30 days ago for filtering
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Scrape each account
      for (const account of accounts) {
        accountsFound.add(account.username);
        
        try {
          console.log(`Scraping account: @${account.username}`);

          const apifyResponse = await fetch(
            `https://api.apify.com/v2/acts/nH2AHrwxeTRJoN5hX/run-sync-get-dataset-items?token=${apifyApiKeySecret}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: [account.username],
                resultsLimit: 5,
              }),
            }
          );

          if (!apifyResponse.ok) {
            console.error(`Apify error for ${account.username}: ${apifyResponse.statusText}`);
            continue;
          }

          const apifyData: ApifyDatasetItem[] = await apifyResponse.json();
          console.log(`Apify returned ${apifyData.length} results for @${account.username}`);

          if (!apifyData || apifyData.length === 0) {
            continue;
          }

          // Filter recent posts
          const recentPosts = apifyData.filter(post => {
            if (!post.timestamp) return false;
            const postDate = new Date(post.timestamp);
            return postDate >= thirtyDaysAgo;
          });

          console.log(`Processing ${recentPosts.length} recent posts for @${account.username}`);

          // Update account info
          if (recentPosts.length > 0) {
            const firstPost = recentPosts[0];
            await supabase
              .from('instagram_accounts')
              .update({
                display_name: firstPost.ownerFullName,
                last_scraped_at: new Date().toISOString(),
              })
              .eq('id', account.id);
          }

          // Process each post
          for (const post of recentPosts) {
            const postId = post.id || post.shortCode || 'unknown';
            
            const likesCount = (post.likesCount === -1 || !post.likesCount) ? 0 : post.likesCount;
            const commentsCount = post.commentsCount || 0;
            const hashtags = post.hashtags || [];
            const mentions = post.mentions || [];
            const postUrl = post.url || `https://www.instagram.com/p/${post.shortCode}/`;

            // Parse event information
            const eventInfo = parseEventFromCaption(post.caption || '', post.locationName);

            // Skip non-events
            if (!eventInfo.isEvent) {
              totalSkipped++;
              continue;
            }

            // Note: We don't filter by past event dates during direct scraping
            // The OCR will extract the actual event date from the image
            // Past posts may still have future events advertised in them

            // Check if post exists
            const { data: existingPost } = await supabase
              .from('instagram_posts')
              .select('id, caption')
              .eq('post_id', postId)
              .maybeSingle();

            if (existingPost) {
              // Check for caption changes
              if (existingPost.caption !== post.caption) {
                const newEventInfo = parseEventFromCaption(post.caption || '', post.locationName);
                
                if (newEventInfo.isEvent && newEventInfo.eventDate && newEventInfo.locationName) {
                  await supabase
                    .from('instagram_posts')
                    .update({
                      caption: post.caption,
                      event_date: newEventInfo.eventDate,
                      event_time: newEventInfo.eventTime,
                      location_name: newEventInfo.locationName,
                      location_address: newEventInfo.locationAddress,
                      likes_count: likesCount,
                      comments_count: commentsCount,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingPost.id);
                  
                  totalUpdatedPosts++;
                }
              }
              continue;
            }

            // Check for duplicate events
            if (eventInfo.eventDate && eventInfo.locationName) {
              const eventDateObj = new Date(eventInfo.eventDate);
              const dayBefore = new Date(eventDateObj);
              dayBefore.setDate(dayBefore.getDate() - 1);
              const dayAfter = new Date(eventDateObj);
              dayAfter.setDate(dayAfter.getDate() + 1);

              const { data: similarEvents } = await supabase
                .from('instagram_posts')
                .select('id, post_id, event_title, likes_count')
                .eq('location_name', eventInfo.locationName)
                .gte('event_date', dayBefore.toISOString().split('T')[0])
                .lte('event_date', dayAfter.toISOString().split('T')[0])
                .eq('is_event', true);

              if (similarEvents && similarEvents.length > 0) {
                for (const similar of similarEvents) {
                  if (similar.post_id !== postId) {
                    const { data: existingGroup } = await supabase
                      .from('event_groups')
                      .select('*')
                      .or(`primary_post_id.eq.${similar.id},merged_post_ids.cs.{${similar.id}}`)
                      .maybeSingle();

                    if (existingGroup) {
                      const updatedMergedIds = [...(existingGroup.merged_post_ids || [])];
                      if (!updatedMergedIds.includes(postId)) {
                        updatedMergedIds.push(postId);
                        await supabase
                          .from('event_groups')
                          .update({ merged_post_ids: updatedMergedIds })
                          .eq('id', existingGroup.id);
                      }
                    } else {
                      const primaryId = likesCount > similar.likes_count ? postId : similar.post_id;
                      const mergedId = likesCount > similar.likes_count ? similar.post_id : postId;
                      
                      await supabase
                        .from('event_groups')
                        .insert({
                          primary_post_id: primaryId,
                          merged_post_ids: [mergedId]
                        });
                    }
                  }
                }
              }
            }

            // Detect incomplete data
            const hasIncompleteData = !eventInfo.eventDate || !eventInfo.eventTime || !eventInfo.locationName;

            // Extract image URL from Apify data
            const imageUrl = post.displayUrl || post.imageUrl;

            // Insert new post
            const { data: insertedPost, error: insertError } = await supabase
              .from('instagram_posts')
              .insert({
                instagram_account_id: account.id,
                post_id: postId,
                caption: post.caption,
                post_url: postUrl,
                image_url: imageUrl,
                posted_at: post.timestamp,
                likes_count: likesCount,
                comments_count: commentsCount,
                hashtags: hashtags,
                mentions: mentions,
                is_event: true,
                event_title: eventInfo.eventTitle,
                event_date: eventInfo.eventDate,
                event_time: eventInfo.eventTime,
                location_name: eventInfo.locationName,
                location_address: eventInfo.locationAddress,
                signup_url: eventInfo.signupUrl,
                needs_review: hasIncompleteData,
                ocr_processed: false,
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Failed to insert post ${postId}:`, insertError.message);
            } else {
              totalScrapedPosts++;

              // Trigger OCR for incomplete posts
              if (hasIncompleteData && insertedPost) {
                try {
                  await supabase.functions.invoke('enrich-post-ocr', {
                    body: { postId: insertedPost.id }
                  });
                } catch (ocrError) {
                  console.error(`Failed to trigger OCR for post ${postId}:`, ocrError);
                }
              }
            }
          }
        } catch (accountError) {
          console.error(`Error scraping account ${account.username}:`, accountError);
        }
      }
    }

    console.log(`Import completed. New: ${totalScrapedPosts}, Updated: ${totalUpdatedPosts}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`);
    if (totalFailed > 0) {
      console.log('Failure reasons:', failureReasons);
    }

    // Update scrape run record
    if (runId) {
      await supabase.from('scrape_runs').update({
        status: 'completed',
        posts_added: totalScrapedPosts,
        posts_updated: totalUpdatedPosts,
        accounts_found: accountsFound.size,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    return new Response(
      JSON.stringify({ 
        message: datasetId ? 'Dataset import completed' : 'Scraping completed',
        accountsProcessed: accountsFound.size,
        newPostsAdded: totalScrapedPosts,
        postsUpdated: totalUpdatedPosts,
        postsSkipped: totalSkipped,
        postsFailed: totalFailed,
        failureReasons: totalFailed > 0 ? failureReasons : undefined,
        datasetId: datasetId || null,
        runId: runId,
        forceImport: forceImport,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-instagram function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Update scrape run as failed if we have a runId
    if (runId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase.from('scrape_runs').update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        }).eq('id', runId);
      } catch (updateError) {
        console.error('Failed to update scrape run status:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
