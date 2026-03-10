export type ParsedMarkedWord = {
  phrase: string;
  context: string;
  word: string;
};

export function parseMarkedWord(phrase: string): ParsedMarkedWord {
  const markerMatches = [...phrase.matchAll(/\*([^*]+)\*/g)];
  const firstMarked = markerMatches
    .map((match) => (match[1] ?? "").trim().replace(/\s+/g, " "))
    .find(Boolean);
  const context = phrase.replace(/\*/g, "").trim();
  const word = firstMarked || context || phrase.trim();

  return {
    phrase,
    context: context || phrase.trim(),
    word,
  };
}
