import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

export interface LogEntry {
  run_id: string;
  post_id?: string;
  instagram_post_id?: string;
  log_level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  stage: 'fetch' | 'ocr' | 'parse' | 'extraction' | 'validation' | 'save' | 'skip' | 'rejection' | 'geocache' | 'image' | 'pre_filter';
  message: string;
  data?: any;
  duration_ms?: number;
  error_details?: any;
}

// ============================================================
// REJECTED POST LOGGING TYPES
// ============================================================

/**
 * Enum for reasons a post may be rejected from the scraper pipeline.
 * Used for consistent categorization and filtering of rejected posts.
 */
export type RejectedPostReason =
  | 'NOT_EVENT'
  | 'EVENT_ENDED'
  | 'VENUE_VALIDATION_FAILED'
  | 'PARSE_FAILED'
  | 'TIME_VALIDATION_FAILED';

/**
 * Data structure for logging rejected posts.
 * Includes required fields and optional context for debugging.
 */
export interface RejectedPostLogData {
  /** The internal post ID (e.g., from Instagram shortCode or Apify ID) */
  postId: string;
  /** The Instagram post ID if different from postId */
  instagramPostId?: string;
  /** The reason the post was rejected */
  reason: RejectedPostReason;
  /** Human-readable explanation of the rejection */
  reasonMessage: string;
  /** Optional: Event date if available */
  eventDate?: string | null;
  /** Optional: Event time if available */
  eventTime?: string | null;
  /** Optional: End time if available */
  endTime?: string | null;
  /** Optional: Location name if available */
  locationName?: string | null;
  /** Optional: Location address if available */
  locationAddress?: string | null;
  /** Optional: Preview of the caption (first 200 chars) */
  captionPreview?: string | null;
  /** Optional: Arbitrary extra data for debugging */
  extra?: Record<string, unknown>;
}

export class ScraperLogger {
  private supabase: SupabaseClient;
  private runId: string;
  private buffer: LogEntry[] = [];
  private flushInterval: number | null = null;
  
  constructor(supabase: SupabaseClient, runId: string) {
    this.supabase = supabase;
    this.runId = runId;
    
    // Auto-flush every 2 seconds
    this.flushInterval = setInterval(() => this.flush(), 2000);
  }

  async log(entry: Omit<LogEntry, 'run_id'>) {
    const fullEntry: LogEntry = {
      ...entry,
      run_id: this.runId,
    };
    
    this.buffer.push(fullEntry);
    
    // Also log to console for real-time debugging
    const prefix = `[${entry.stage.toUpperCase()}] [${entry.log_level.toUpperCase()}]`;
    console.log(`${prefix} ${entry.message}`, entry.data || '');
    
    // Flush if buffer gets large
    if (this.buffer.length >= 50) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;
    
    const entries = [...this.buffer];
    this.buffer = [];
    
    try {
      const { error } = await this.supabase
        .from('scraper_logs')
        .insert(entries);
      
      if (error) {
        console.error('Failed to save logs:', error);
        // Put them back in buffer to retry
        this.buffer.unshift(...entries);
      }
    } catch (err) {
      console.error('Error flushing logs:', err);
      this.buffer.unshift(...entries);
    }
  }

  async close() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  // Convenience methods
  async info(stage: LogEntry['stage'], message: string, data?: any) {
    await this.log({ log_level: 'info', stage, message, data });
  }

  async success(stage: LogEntry['stage'], message: string, data?: any) {
    await this.log({ log_level: 'success', stage, message, data });
  }

  async warn(stage: LogEntry['stage'], message: string, data?: any) {
    await this.log({ log_level: 'warn', stage, message, data });
  }

  async error(stage: LogEntry['stage'], message: string, data?: any, error_details?: any) {
    await this.log({ log_level: 'error', stage, message, data, error_details });
  }

  async debug(stage: LogEntry['stage'], message: string, data?: any) {
    await this.log({ log_level: 'debug', stage, message, data });
  }

  // Detailed extraction logging
  async logExtraction(
    post_id: string,
    instagram_post_id: string | undefined,
    field: string,
    extracted_value: any,
    method: string,
    pattern_used?: string,
    pattern_id?: string | null,
    duration_ms?: number
  ) {
    await this.log({
      post_id,
      instagram_post_id,
      log_level: 'debug',
      stage: 'extraction',
      message: `Extracted ${field}: ${extracted_value}`,
      data: {
        field,
        extracted_value,
        method,
        pattern_used,
        pattern_id,
      },
      duration_ms,
    });
  }

  async logOCR(
    post_id: string,
    instagram_post_id: string | undefined,
    ocr_text: string,
    confidence: number,
    duration_ms: number
  ) {
    await this.log({
      post_id,
      instagram_post_id,
      log_level: 'info',
      stage: 'ocr',
      message: `OCR completed with ${confidence}% confidence`,
      data: {
        ocr_text: ocr_text.substring(0, 500), // Truncate long text
        confidence,
        text_length: ocr_text.length,
      },
      duration_ms,
    });
  }

  async logParsing(
    post_id: string,
    instagram_post_id: string | undefined,
    caption: string,
    parsed_data: any,
    duration_ms: number
  ) {
    await this.log({
      post_id,
      instagram_post_id,
      log_level: 'info',
      stage: 'parse',
      message: `Caption parsed successfully`,
      data: {
        caption_preview: caption.substring(0, 200),
        parsed_fields: Object.keys(parsed_data).filter(k => parsed_data[k] !== undefined),
        parsed_data,
        // Include pattern IDs if present
        pattern_ids: {
          price: parsed_data.pricePatternId,
          date: parsed_data.datePatternId,
          time: parsed_data.timePatternId,
          venue: parsed_data.venuePatternId,
          vendor: parsed_data.vendorPatternId,
        },
      },
      duration_ms,
    });
  }

  async logValidation(
    post_id: string,
    instagram_post_id: string | undefined,
    is_valid: boolean,
    validation_errors: string[],
    data?: any
  ) {
    await this.log({
      post_id,
      instagram_post_id,
      log_level: is_valid ? 'success' : 'warn',
      stage: 'validation',
      message: is_valid ? 'Post validation passed' : `Validation failed: ${validation_errors.join(', ')}`,
      data: {
        is_valid,
        validation_errors,
        ...data,
      },
    });
  }

  async logSkip(
    post_id: string,
    reason: string,
    data?: any
  ) {
    await this.log({
      post_id,
      log_level: 'info',
      stage: 'skip',
      message: `Skipping post: ${reason}`,
      data,
    });
  }

  /**
   * Log a rejected post with structured data.
   * Emits a single log entry with stage='rejection' and all rejection context
   * nested under a 'rejected_post' key in the data field.
   */
  async logRejectedPost(data: RejectedPostLogData) {
    await this.log({
      post_id: data.postId,
      instagram_post_id: data.instagramPostId,
      log_level: 'warn',
      stage: 'rejection',
      message: 'Post rejected',
      data: {
        rejected_post: {
          reason: data.reason,
          reasonMessage: data.reasonMessage,
          eventDate: data.eventDate,
          eventTime: data.eventTime,
          endTime: data.endTime,
          locationName: data.locationName,
          locationAddress: data.locationAddress,
          captionPreview: data.captionPreview,
          extra: data.extra,
        },
      },
    });
  }
}
