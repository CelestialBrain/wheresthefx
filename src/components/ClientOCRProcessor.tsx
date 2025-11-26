import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createWorker } from "tesseract.js";
import { Eye, PlayCircle, StopCircle, CheckCircle } from "lucide-react";

interface Post {
  id: string;
  image_url: string;
  stored_image_url: string | null;
  ocr_processed: boolean;
  caption: string | null;
}

export function ClientOCRProcessor() {
  const queryClient = useQueryClient();
  const cancelRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ocrResults, setOcrResults] = useState<{ postId: string; text: string; confidence: number }[]>([]);

  const { data: unprocessedPosts } = useQuery({
    queryKey: ["unprocessed-ocr-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_posts")
        .select("id, image_url, stored_image_url, ocr_processed, caption")
        .eq("ocr_processed", false)
        .not("image_url", "is", null)
        .limit(50);

      if (error) throw error;
      return data as Post[];
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ 
      postId, 
      ocrText, 
      confidence,
      entities 
    }: { 
      postId: string; 
      ocrText: string; 
      confidence: number;
      entities: any;
    }) => {
      const updates: any = {
        ocr_text: ocrText, // PHASE 1: Store raw OCR text
        ocr_confidence: confidence,
        event_title: entities.title || null,
        event_date: entities.date || null,
        event_end_date: entities.endDate || entities.date,
        event_time: entities.time || null,
        location_name: entities.venue || null,
        location_address: entities.address || null,
        price: entities.price || null,
        is_free: entities.isFree,
        is_event: entities.isEvent,
        ocr_processed: true,
        needs_review: true,
      };

      const { error } = await supabase
        .from("instagram_posts")
        .update(updates)
        .eq("id", postId);

      if (error) {
        console.error('OCR update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unprocessed-ocr-posts"] });
      queryClient.invalidateQueries({ queryKey: ["ocr-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["consolidated-review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["posts-without-events"] });
    },
  });

  const convertTimeTo24Hour = (timeStr: string): string | null => {
    try {
      const match = timeStr.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if (!match) return null;
      
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const period = match[3].toLowerCase();
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    } catch (e) {
      return null;
    }
  };

  const extractEntities = (text: string, caption: string | null): any => {
    const combinedText = `${caption || ""}\n${text}`.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Time regex patterns - Enhanced with Filipino patterns
    const timePatterns = [
      // Filipino time patterns
      /alas-?(\d{1,2})(?::(\d{2}))?\s*(?:ng\s+)?(umaga|tanghali|hapon|gabi)/gi,
      // Standard patterns
      /(\d{1,2}):(\d{2})\s*(am|pm)/gi,
      /(\d{1,2})\s*(am|pm)/gi,
    ];
    
    // Price regex patterns
    const pricePatterns = [
      /₱\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
      /php\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:pesos|php)/gi,
    ];
    
    // Venue patterns
    const venuePatterns = [
      /📍\s*([^\n]+)/gi,
      /\bat\s+([A-Z][^\n,]+)/g,
      /\bin\s+([A-Z][^\n,]+)/g,
    ];

    let date = null;
    let time = null;
    let price = null;
    let isFree = /\b(free|libre|walang bayad|gratis|no (entrance )?fee|free (entrance|admission))\b/i.test(combinedText);
    let venue = null;
    
    // Enhanced date extraction with Filipino months
    const filipinoMonths: { [key: string]: number } = {
      'enero': 0, 'pebrero': 1, 'marso': 2, 'abril': 3, 'mayo': 4, 'hunyo': 5,
      'hulyo': 6, 'agosto': 7, 'setyembre': 8, 'oktubre': 9, 'nobyembre': 10, 'disyembre': 11
    };
    
    // Try Filipino date pattern first
    const filipinoDateMatch = combinedText.match(/(\d{1,2})\s+(?:ng\s+)?(enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)/i);
    if (filipinoDateMatch) {
      const day = filipinoDateMatch[1];
      const month = filipinoMonths[filipinoDateMatch[2].toLowerCase()];
      if (month !== undefined) {
        const year = new Date().getFullYear();
        date = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    
    // Fallback to simple date extraction
    if (!date) {
      const simpleDate = combinedText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
      if (simpleDate) date = simpleDate[0];
    }
    
    // Extract time - handle Filipino time patterns
    for (const pattern of timePatterns) {
      const match = combinedText.match(pattern);
      if (match && match[0]) {
        const rawTime = match[0].toLowerCase();
        
        // Handle Filipino time pattern: "alas-8 ng gabi" -> "20:00:00"
        if (rawTime.includes('alas')) {
          const hourMatch = rawTime.match(/alas-?(\d{1,2})/);
          if (hourMatch) {
            let hours = parseInt(hourMatch[1]);
            if (rawTime.includes('gabi') || rawTime.includes('hapon')) {
              if (hours < 12) hours += 12;
            } else if (rawTime.includes('umaga') && hours === 12) {
              hours = 0;
            }
            time = `${hours.toString().padStart(2, '0')}:00:00`;
            break;
          }
        } else {
          time = convertTimeTo24Hour(rawTime);
        }
        
        if (time) break;
      }
    }
    
    // Extract price - Enhanced with Filipino currency patterns
    if (!isFree) {
      const filipinoPricePatterns = [
        /₱\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
        /php\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
        /pesos?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
        /\$\s*(\d+(?:\.\d{2})?)/g,
      ];
      
      for (const pattern of [...filipinoPricePatterns, ...pricePatterns]) {
        const match = combinedText.match(pattern);
        if (match && match[1]) {
          const priceStr = match[1].replace(/,/g, "");
          const parsedPrice = parseFloat(priceStr);
          if (!isNaN(parsedPrice)) {
            price = parsedPrice;
          }
          break;
        }
      }
    }
    
    // Extract venue - add null checks
    for (const pattern of venuePatterns) {
      const match = combinedText.match(pattern);
      if (match && match[1]) {
        venue = match[1].trim();
        break;
      }
    }

    const isEvent = !!(date || time || venue);
    const needsReview = true;

    return {
      title: null,
      date,
      endDate: date,
      time,
      price,
      isFree,
      venue,
      address: null,
      isEvent,
      needsReview,
    };
  };

  const processWithOCR = async (posts: Post[]) => {
    setIsProcessing(true);
    setCurrentIndex(0);
    const results: { postId: string; text: string; confidence: number }[] = [];

    const worker = await createWorker("eng");

    for (let i = 0; i < posts.length; i++) {
      if (cancelRef.current) break; // Allow stopping
      
      const post = posts[i];
      setCurrentIndex(i + 1);
      
      // Force UI update with requestAnimationFrame for smoother progress
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          setProgress(((i + 1) / posts.length) * 100);
          // Small delay to allow render
          setTimeout(resolve, 30);
        });
      });

      try {
        // PHASE 2: Pre-filter small images (< 200x200)
        const imageToProcess = post.stored_image_url || post.image_url;
        const img = new Image();
        img.src = imageToProcess;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        if (img.width < 200 || img.height < 200) {
          console.log(`Skipping OCR for ${post.id}: Image too small (${img.width}x${img.height})`);
          await supabase
            .from('instagram_posts')
            .update({
              ocr_processed: true,
              ocr_confidence: 0,
              needs_review: false,
              is_event: false,
            })
            .eq('id', post.id);
          continue;
        }

        // Check OCR cache first - use stored_image_url if available
        const imageHash = post.stored_image_url || post.image_url;
        const { data: cached } = await supabase
          .from("ocr_cache")
          .select("*")
          .eq("image_url", imageHash)
          .maybeSingle();

        let ocrText = "";
        let confidence = 0;

        if (cached) {
          // Use cached OCR result
          ocrText = cached.ocr_text || "";
          confidence = cached.ocr_confidence || 0;
          
          // Update cache usage
          await supabase
            .from("ocr_cache")
            .update({ 
              use_count: cached.use_count + 1,
              last_used_at: new Date().toISOString() 
            })
            .eq("id", cached.id);
        } else {
          // Use stored_image_url if available (no CORS), fallback to image_url
          const imageToProcess = post.stored_image_url || post.image_url;
          
          // Pre-flight check: try to load image
          try {
            const testImg = new Image();
            const loadPromise = new Promise((resolve, reject) => {
              testImg.onload = resolve;
              testImg.onerror = reject;
              testImg.crossOrigin = 'anonymous';
            });
            testImg.src = imageToProcess;
            await Promise.race([
              loadPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Image load timeout')), 10000)
              )
            ]);
          } catch (loadError: any) {
            const errorType = loadError.message.includes('timeout') ? 'Timeout' : 'CORS Error';
            throw new Error(`${errorType}: ${post.stored_image_url ? 'Stored image' : 'Instagram CDN'} blocked - ${loadError.message}`);
          }
          
          // Run OCR with timeout handling (30 seconds)
          const processWithTimeout = Promise.race([
            worker.recognize(imageToProcess),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('OCR timeout after 30 seconds')), 30000)
            )
          ]);

          const { data: { text, confidence: conf } } = await processWithTimeout as any;
          
          ocrText = text;
          confidence = conf / 100; // Normalize to 0-1

          // Cache the result
          await supabase
            .from("ocr_cache")
            .insert({
              image_url: imageHash,
              image_hash: imageHash,
              ocr_text: ocrText,
              ocr_confidence: confidence,
            });
        }

        results.push({ postId: post.id, text: ocrText, confidence });

        // Extract entities using regex (keep original sync version)
        const entities = extractEntities(ocrText, post.caption);
        
        // Log OCR processing to scraper_logs
        await supabase.from('scraper_logs').insert({
          log_level: 'info',
          stage: 'ocr',
          message: `Client OCR processed: ${(confidence * 100).toFixed(0)}% confidence`,
          instagram_post_id: post.id,
          data: {
            confidence,
            textLength: ocrText.length,
            extractedEntities: entities,
            imageDimensions: `${img.width}x${img.height}`,
            imageSource: post.stored_image_url ? 'stored' : 'cdn'
          }
        });

        // Update post
        await updatePostMutation.mutateAsync({
          postId: post.id,
          ocrText,
          confidence,
          entities,
        });

      } catch (error: any) {
        console.error(`Error processing post ${i + 1}:`, error);
        
        // Determine error type for better logging
        const isCorsError = error.message?.includes('CORS') || error.message?.includes('blocked');
        const errorMessage = isCorsError 
          ? `Image blocked by CORS - needs re-scraping: ${error.message}`
          : error.message || 'Unknown error';
        
        // Log OCR error to scraper_logs
        await supabase.from('scraper_logs').insert({
          log_level: 'error',
          stage: 'ocr',
          message: `Client OCR failed: ${errorMessage}`,
          instagram_post_id: post.id,
          error_details: {
            errorType: isCorsError ? 'CORS' : 'OCR',
            message: error.message,
            stack: error.stack,
            imageUrl: post.stored_image_url || post.image_url
          }
        });
        
        // Log error to database for tracking (use direct query to avoid mutation conflicts)
        try {
          await supabase
            .from("instagram_posts")
            .update({
              ocr_error_count: 1,
              ocr_last_error: errorMessage,
              ocr_last_attempt_at: new Date().toISOString(),
              ocr_processed: false
            })
            .eq("id", post.id);
        } catch (dbError) {
          console.error('Failed to log OCR error:', dbError);
        }
        
        toast.error(isCorsError 
          ? `Post ${i + 1}: Image blocked by CORS. Run scraper to re-download.`
          : `OCR failed for post ${i + 1}: ${error.message}`
        );
        
        // Continue processing next post instead of breaking
        continue;
      }
    }

    await worker.terminate();
    setOcrResults(results);
    setIsProcessing(false);
    toast.success(`Processed ${posts.length} images with OCR!`);
  };

  const handleStart = () => {
    if (!unprocessedPosts || unprocessedPosts.length === 0) {
      toast.error("No posts to process");
      return;
    }
    cancelRef.current = false;
    processWithOCR(unprocessedPosts);
  };

  const handleStop = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    toast.info("OCR processing stopped");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6" />
            <div>
              <CardTitle>Client-Side OCR Processor</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Runs Tesseract.js in your browser - completely free, no API calls
              </p>
            </div>
          </div>
          {unprocessedPosts && unprocessedPosts.length > 0 && (
            <Badge variant="secondary">
              {unprocessedPosts.length} posts pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProcessing ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing post {currentIndex} of {unprocessedPosts?.length || 0}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
            <Button onClick={handleStop} variant="destructive" className="w-full">
              <StopCircle className="w-4 h-4 mr-2" />
              Stop Processing
            </Button>
          </>
        ) : (
          <>
            {unprocessedPosts && unprocessedPosts.length > 0 ? (
              <Button onClick={handleStart} className="w-full">
                <PlayCircle className="w-4 h-4 mr-2" />
                Start OCR Processing ({unprocessedPosts.length} posts)
              </Button>
            ) : (
              <div className="flex items-center justify-center py-8 text-center">
                <div>
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">All posts processed!</p>
                  <p className="text-sm text-muted-foreground">No pending OCR tasks</p>
                </div>
              </div>
            )}
          </>
        )}

        {ocrResults.length > 0 && (
          <div className="mt-6 space-y-2">
            <h4 className="text-sm font-medium">Recent Results:</h4>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {ocrResults.slice(-5).reverse().map((result, idx) => (
                <div key={idx} className="bg-muted/50 rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono truncate">{result.postId.slice(0, 8)}...</span>
                    <Badge variant="outline" className="text-xs">
                      {(result.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{result.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t space-y-2 text-xs text-muted-foreground">
          <p><strong>How it works:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Runs Tesseract OCR engine in your browser (no server calls)</li>
            <li>Caches OCR results to avoid re-processing same images</li>
            <li>Uses regex patterns to extract dates, times, prices, venues</li>
            <li>Completely free - no AI API costs</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
