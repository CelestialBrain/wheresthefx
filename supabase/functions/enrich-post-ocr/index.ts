import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the post
    const { data: post, error: fetchError } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      throw new Error('Post not found');
    }

    // Skip if already processed
    if (post.ocr_processed) {
      return new Response(
        JSON.stringify({ message: 'Already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the direct image URL from the database
    const imageUrl = post.image_url;
    
    if (!imageUrl) {
      console.log(`Post ${postId} has no image_url, marking as needs_review`);
      
      await supabase
        .from('instagram_posts')
        .update({
          ocr_processed: true,
          ocr_last_attempt: new Date().toISOString(),
          needs_review: true,
        })
        .eq('id', postId);
      
      throw new Error('No image URL available for OCR - post marked for review');
    }
    
    console.log(`Attempting OCR for post ${postId} with image URL: ${imageUrl}`);

    // Call Lovable AI vision model
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are analyzing an Instagram post image to extract event details. Look carefully for:
                
                EVENT DETAILS:
                - Event title/name (often in large or stylized text, headers, or main titles)
                - Date (check month names, numbers, day of week)
                - Time (AM/PM, 24-hour format, "doors open", "starts at")
                - Price or "FREE" mentions
                
                LOCATION EXTRACTION (PRIORITY ORDER):
                1. Pin emoji (📍) followed by venue name and address
                   Example: "📍 Living Room, 42 Esteban Abada" → location_name: "Living Room", location_address: "42 Esteban Abada"
                2. Street names and numbers
                   Examples: "42 Esteban Abada", "Katipunan Avenue", "Jupiter Street"
                3. Building names and floor numbers
                   Examples: "2F The Barn", "Molito Lifestyle Center", "BGC"
                4. City/area names
                   Examples: "Makati", "Quezon City", "Manila", "BGC", "Poblacion"
                5. Venue names in all caps or special fonts
                
                Common patterns to watch for:
                - Dates like "March 15, 2025", "15/3", "October 25"
                - Times like "9PM", "21:00", "9-2AM", "doors open at 8pm"
                - Location indicators: "📍", "@", "at", "venue:", "location:"
                - Philippine street patterns: "[Number] [Street Name]", "[Area] Avenue"
                
                CRITICAL: 
                - Extract the EVENT DATE (when the event happens), not the post date
                - Separate VENUE NAME from STREET ADDRESS if both are present
                - Look for pin emojis (📍) as the strongest location indicator
                
                Return ONLY valid JSON in this format (use null for missing values):
                {
                  "event_title": "string or null",
                  "event_date": "YYYY-MM-DD or null (convert dates to this format, assume year 2025 if not specified)",
                  "event_time": "HH:MM or null (24-hour format)",
                  "location_name": "venue name only (e.g., 'Living Room', 'The Barn')",
                  "location_address": "street address only (e.g., '42 Esteban Abada, Loyola Heights')",
                  "price": "number or null"
                }
                
                If the image is not an event poster or doesn't contain event information, return all null values.`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      // Mark as attempted so we don't retry infinitely
      await supabase
        .from('instagram_posts')
        .update({
          ocr_last_attempt: new Date().toISOString(),
          ocr_processed: true,
          needs_review: true,
        })
        .eq('id', postId);
      
      throw new Error(`AI API error ${aiResponse.status}: ${errorText.substring(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content from AI');
    }

    console.log('AI Response:', content);

    // Parse the JSON response
    let extractedData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        extractedData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid JSON from AI');
    }

    // Calculate confidence based on how many fields were extracted
    const fieldsExtracted = Object.values(extractedData).filter(v => v !== null).length;
    const confidence = (fieldsExtracted / 6) * 100; // 6 fields total (removed is_free)

    // Determine if this is a complete event
    const isComplete = extractedData.event_date && extractedData.location_name;
    const needsReview = !isComplete;

    // Update the post with OCR data
    const updateData: any = {
      ocr_processed: true,
      ocr_last_attempt: new Date().toISOString(),
      ocr_confidence: confidence,
      needs_review: needsReview,
    };

    // Only update fields if OCR found data
    if (extractedData.event_title) updateData.event_title = extractedData.event_title;
    if (extractedData.event_date) updateData.event_date = extractedData.event_date;
    if (extractedData.event_time) updateData.event_time = extractedData.event_time;
    if (extractedData.location_name) updateData.location_name = extractedData.location_name;
    if (extractedData.location_address) updateData.location_address = extractedData.location_address;
    if (extractedData.price !== undefined && extractedData.price !== null) updateData.price = extractedData.price;

    // Mark as event if we have enough data
    if (isComplete) {
      updateData.is_event = true;
    }

    const { error: updateError } = await supabase
      .from('instagram_posts')
      .update(updateData)
      .eq('id', postId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log(`OCR completed for post ${postId}. Confidence: ${confidence}%`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        confidence,
        extractedData,
        needsReview 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-post-ocr:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
