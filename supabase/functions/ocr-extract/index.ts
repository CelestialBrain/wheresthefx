/**
 * OCR Extraction Edge Function using OCR.space API
 * 
 * This function extracts text from event poster images using the OCR.space API,
 * which handles stylized fonts better than Tesseract. The extracted text is
 * then used by the AI extraction pipeline for intelligent parsing.
 */

// OCR.space exit code confidence mapping
// Exit code 1: File parsed successfully
// Exit code 0: File parsed but without confidence
// Other codes: Partial or failed parsing
const OCR_CONFIDENCE_SUCCESS = 0.9;
const OCR_CONFIDENCE_PARSED = 0.7;
const OCR_CONFIDENCE_PARTIAL = 0.5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRResult {
  success: boolean;
  textLines: string[];
  fullText: string;
  confidence: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageUrl is required', textLines: [], fullText: '', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');
    if (!ocrApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OCR_SPACE_API_KEY not configured', textLines: [], fullText: '', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Call OCR.space API
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for stylized text
    formData.append('scale', 'true'); // Upscale image for better accuracy
    formData.append('detectOrientation', 'true');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': ocrApiKey },
      body: formData,
    });

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.ErrorMessage?.[0] || 'OCR processing failed',
          textLines: [],
          fullText: '',
          confidence: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract text lines from overlay
    interface OCRLine {
      LineText: string;
    }
    
    const textLines: string[] = result.ParsedResults?.[0]?.TextOverlay?.Lines?.map(
      (line: OCRLine) => line.LineText
    ) || [];

    const fullText: string = result.ParsedResults?.[0]?.ParsedText || '';
    
    // Calculate confidence from exit code
    // Exit code 1 = success, 0 = parsed but uncertain, other = partial
    const exitCode: number = result.ParsedResults?.[0]?.FileParseExitCode || 0;
    const confidence = exitCode === 1 ? OCR_CONFIDENCE_SUCCESS : 
                       exitCode === 0 ? OCR_CONFIDENCE_PARSED : 
                       OCR_CONFIDENCE_PARTIAL;

    const ocrResult: OCRResult = {
      success: true,
      textLines,
      fullText: fullText.trim(),
      confidence
    };

    return new Response(
      JSON.stringify(ocrResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        textLines: [],
        fullText: '',
        confidence: 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
