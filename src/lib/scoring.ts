// Shared scoring utility for consistent scoring across the application
// Extracted from /api/assignments/submit/route.ts to ensure consistency

/**
 * Calculate score based on question type and student answer
 * @param questionType - Type of question (single, multiple, boolean, short_text, numeric)
 * @param studentAnswer - Student's submitted answer
 * @param correctAnswer - Correct answer from question.answerKey
 * @param maxScore - Maximum possible score for this question
 * @returns Earned score (0 to maxScore)
 */
export function calculateScore(questionType: string, studentAnswer: unknown, correctAnswer: unknown, maxScore: number): number {
  // Check for explicitly undefined/null answers, but allow false and 0 as valid answers
  if (studentAnswer === undefined || studentAnswer === null) return 0;

  // Normalize correctAnswer to handle both array and primitive formats
  const normalizeAnswer = (answer: unknown): unknown[] => {
    if (Array.isArray(answer)) {
      return answer;
    }
    return [answer];
  };

  const correctAnswerArray = normalizeAnswer(correctAnswer);

  switch (questionType) {
    case 'single':
    case 'boolean':
      // Exact match required
      if (correctAnswerArray.length > 0) {
        return studentAnswer === correctAnswerArray[0] ? maxScore : 0;
      }
      return 0;

    case 'multiple':
      // All correct answers must be selected, no extra answers
      if (!Array.isArray(studentAnswer)) return 0;
      const studentSet = new Set(studentAnswer);
      const correctSet = new Set(correctAnswerArray);

      if (studentSet.size !== correctSet.size) return 0;

      for (const answer of correctAnswerArray) {
        if (!studentSet.has(answer)) return 0;
      }
      return maxScore;

    case 'short_text':
      // Manual review questions should return 0 for auto-scoring
      return 0;

    case 'numeric':
      // Allow small floating point differences
      if (correctAnswerArray.length > 0) {
        const studentNum = parseFloat(String(studentAnswer));
        const correctNum = parseFloat(String(correctAnswerArray[0]));
        const epsilon = 0.001; // Small tolerance for floating point comparison

        if (isNaN(studentNum) || isNaN(correctNum)) return 0;
        return Math.abs(studentNum - correctNum) <= epsilon ? maxScore : 0;
      }
      return 0;

    default:
      return 0;
  }
}

/**
 * Get effective score for display and calculation
 * Uses manual score if available, otherwise falls back to earned score
 * @param earnedScore - Auto-calculated score
 * @param manualScore - Manual score from reviewer (can be null)
 * @returns The effective score to use
 */
export function getEffectiveScore(earnedScore: number | string, manualScore: number | string | null | undefined): number {
  if (manualScore !== null && manualScore !== undefined) {
    return typeof manualScore === 'string' ? parseFloat(manualScore) : manualScore;
  }
  return typeof earnedScore === 'string' ? parseFloat(earnedScore) : earnedScore;
}