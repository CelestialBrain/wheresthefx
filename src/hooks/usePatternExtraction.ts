// TODO: needs admin API endpoints for extraction_patterns and extraction_corrections tables.
// Pattern extraction is admin-only functionality. These functions are stubs until
// dedicated Express endpoints are built.

export const usePatternExtraction = () => {
  const extractWithLearnedPatterns = async (
    _text: string,
    _patternType: string
  ): Promise<{ value: string | null; patternId: string | null }> => {
    return { value: null, patternId: null };
  };

  const logCorrection = async (
    _postId: string,
    _fieldName: string,
    _originalValue: unknown,
    _correctedValue: unknown,
    _ocrText?: string,
    _patternUsed?: string
  ) => {
    // TODO: needs admin API endpoint — POST /api/admin/extraction-corrections
  };

  return {
    extractWithLearnedPatterns,
    logCorrection,
  };
};
