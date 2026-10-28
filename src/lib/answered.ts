// Shared rule for whether a question has an answer, used by the quiz page and the submit API.
// false (boolean) and 0 (numeric) are answers; whitespace-only short text is not.
export function isAnswered(questionType: string, response: unknown): boolean {
  if (response === undefined || response === null) return false;

  if (questionType === 'multiple') {
    return Array.isArray(response) && response.length > 0;
  }

  if (questionType === 'short_text') {
    const content = typeof response === 'object'
      ? (response as { content?: unknown }).content
      : response;
    return typeof content === 'string' && content.trim() !== '';
  }

  return response !== '';
}
