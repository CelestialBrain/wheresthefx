import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

export interface LogEntry {
  run_id: string;
  post_id?: string;
  instagram_post_id?: string;
  log_level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  stage: 'fetch' | 'ocr' | 'parse' | 'extraction' | 'validation' | 'save' | 'skip';
  message: string;
  data?: any;
  duration_ms?: number;
  error_details?: any;
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
}
