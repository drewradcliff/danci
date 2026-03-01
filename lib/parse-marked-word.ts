export type ParsedMarkedWord = {
  phrase: string;
  context: string;
  word: string;
};

export class MarkedWordParseError extends Error {
  readonly code = "INVALID_MARKER";

  constructor(message = "Phrase must contain exactly one *word* marker.") {
    super(message);
    this.name = "MarkedWordParseError";
  }
}

export function parseMarkedWord(phrase: string): ParsedMarkedWord {
  const markerMatches = [...phrase.matchAll(/\*([^*]*)\*/g)];
  const asteriskCount = (phrase.match(/\*/g) ?? []).length;

  if (markerMatches.length !== 1 || asteriskCount !== 2) {
    throw new MarkedWordParseError();
  }

  const word = markerMatches[0]?.[1] ?? "";

  if (!word || /\s/.test(word)) {
    throw new MarkedWordParseError();
  }

  return {
    phrase,
    context: phrase.replace(/\*/g, ""),
    word,
  };
}
