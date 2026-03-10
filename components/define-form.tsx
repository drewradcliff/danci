"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type HistoryItem = {
  id: string;
  phraseInput: string;
  targetText: string;
  contextText: string;
  resultPreview: string | null;
  createdAt: string;
  flashcard: {
    id: string;
    term: string;
  } | null;
};

type DefineApiSuccess = {
  phrase: string;
  context: string;
  structured: {
    word: string;
    meaning: string;
    examples: string[];
  } | null;
  fallbackText: string | null;
  // Compatibility shape from API fallback.
  word?: string;
  definition?: {
    meaning: string;
    examples: string[];
  };
  meta: {
    definitionsFound: number;
    dictionaryLookupFailed?: boolean;
    dictionaryErrorCode?: string | null;
    usedFallback: boolean;
    jsonParseFailed: boolean;
  };
  historyItem?: HistoryItem;
};

type DefineApiError = {
  error: {
    code: string;
    message: string;
  };
};

type HistoryApiSuccess = {
  items: HistoryItem[];
  nextCursor: string | null;
};

type ToggleFlashcardSuccess = {
  active: boolean;
  alreadyExisted?: boolean;
  flashcardId?: string;
  term?: string;
};

type PreviewParts = {
  before: string;
  marked: string;
  after: string;
};

type FlashcardItem = {
  id: string;
  term: string;
  lookupHistoryId: string | null;
  createdAt: string;
  content: {
    phraseInput: string;
    targetText: string;
    word: string | null;
    structured: {
      word: string;
      meaning: string;
      examples: string[];
    } | null;
    fallbackText: string | null;
    definition: {
      meaning: string;
      examples: string[];
    } | null;
    resultPreview: string | null;
  } | null;
};

type FlashcardsApiSuccess = {
  items: FlashcardItem[];
};

type RemoveFlashcardSuccess = {
  removed: boolean;
  flashcardId: string;
};

function getPreviewParts(phrase: string): PreviewParts | null {
  const firstMarkerIndex = phrase.indexOf("*");

  if (firstMarkerIndex === -1) {
    return null;
  }

  const secondMarkerIndex = phrase.indexOf("*", firstMarkerIndex + 1);

  if (secondMarkerIndex === -1) {
    return null;
  }

  const marked = phrase.slice(firstMarkerIndex + 1, secondMarkerIndex);

  if (!marked) {
    return null;
  }

  return {
    before: phrase.slice(0, firstMarkerIndex).replace(/\*/g, ""),
    marked,
    after: phrase.slice(secondMarkerIndex + 1).replace(/\*/g, ""),
  };
}

export function DefineForm() {
  const [activeView, setActiveView] = useState<"define" | "history" | "flashcards">(
    "define",
  );
  const [phrase, setPhrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DefineApiSuccess | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [flashcardsError, setFlashcardsError] = useState<string | null>(null);
  const [isFlashcardsLoading, setIsFlashcardsLoading] = useState(false);
  const [removingFlashcardId, setRemovingFlashcardId] = useState<string | null>(null);
  const [expandedFlashcardId, setExpandedFlashcardId] = useState<string | null>(null);
  const preview = getPreviewParts(phrase);

  function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function mergeHistory(previous: HistoryItem[], incoming: HistoryItem[]): HistoryItem[] {
    const merged = [...incoming, ...previous];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    });
  }

  async function loadHistory(options?: { cursor?: string | null; append?: boolean }) {
    const cursor = options?.cursor ?? null;
    const append = options?.append ?? false;

    if (append) {
      setIsHistoryLoadingMore(true);
    } else {
      setIsHistoryLoading(true);
      setHistoryError(null);
    }

    try {
      const query = new URLSearchParams();
      if (cursor) {
        query.set("cursor", cursor);
      }
      query.set("limit", "20");
      const response = await fetch(`/api/history?${query.toString()}`);
      const payload = (await response.json()) as HistoryApiSuccess | DefineApiError;

      if (!response.ok) {
        const fallbackMessage = "Unable to load history.";
        setHistoryError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage,
        );
        return;
      }

      const historyPayload = payload as HistoryApiSuccess;
      setHistoryCursor(historyPayload.nextCursor);
      setHistoryItems((previous) =>
        append ? [...previous, ...historyPayload.items] : historyPayload.items,
      );
    } catch {
      setHistoryError("Network error while loading history.");
    } finally {
      if (append) {
        setIsHistoryLoadingMore(false);
      } else {
        setIsHistoryLoading(false);
      }
    }
  }

  function renderHighlightedSentence(phraseText: string, targetText: string) {
    const marked = getPreviewParts(phraseText);
    if (marked) {
      return (
        <span>
          {marked.before}
          <span className="home-preview-mark">{marked.marked}</span>
          {marked.after}
        </span>
      );
    }

    const index = phraseText.toLowerCase().indexOf(targetText.toLowerCase());
    if (index === -1 || !targetText.trim()) {
      return <span>{phraseText}</span>;
    }

    const before = phraseText.slice(0, index);
    const match = phraseText.slice(index, index + targetText.length);
    const after = phraseText.slice(index + targetText.length);

    return (
      <span>
        {before}
        <span className="home-preview-mark">{match}</span>
        {after}
      </span>
    );
  }

  async function loadFlashcards() {
    setIsFlashcardsLoading(true);
    setFlashcardsError(null);

    try {
      const response = await fetch("/api/flashcards");
      const payload = (await response.json()) as FlashcardsApiSuccess | DefineApiError;

      if (!response.ok) {
        const fallbackMessage = "Unable to load flashcards.";
        setFlashcardsError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage,
        );
        return;
      }

      setFlashcards((payload as FlashcardsApiSuccess).items);
    } catch {
      setFlashcardsError("Network error while loading flashcards.");
    } finally {
      setIsFlashcardsLoading(false);
    }
  }

  async function addFlashcard(item: HistoryItem) {
    if (historyActionId || item.flashcard) {
      return;
    }

    setHistoryActionId(item.id);
    setHistoryError(null);
    setFlashcardsError(null);

    try {
      const response = await fetch("/api/flashcards", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lookupHistoryId: item.id }),
      });

      const payload = (await response.json()) as ToggleFlashcardSuccess | DefineApiError;
      if (!response.ok) {
        const fallbackMessage = "Unable to add flashcard.";
        setHistoryError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage,
        );
        return;
      }

      const addPayload = payload as ToggleFlashcardSuccess;
      const flashcardId = addPayload.flashcardId ?? `flashcard-${item.id}`;
      const term = addPayload.term ?? item.targetText;

      setHistoryItems((current) =>
        current.map((historyItem) =>
          historyItem.id === item.id
            ? {
                ...historyItem,
                flashcard: {
                  id: flashcardId,
                  term,
                },
              }
            : historyItem,
        ),
      );

      setFlashcards((current) => {
        if (current.some((card) => card.id === flashcardId)) {
          return current;
        }

        return [
          {
            id: flashcardId,
            term,
            lookupHistoryId: item.id,
            createdAt: new Date().toISOString(),
            content: {
              phraseInput: item.phraseInput,
              targetText: item.targetText,
              word: item.targetText,
              structured: null,
              fallbackText: item.resultPreview,
              definition: null,
              resultPreview: item.resultPreview,
            },
          },
          ...current,
        ];
      });
    } catch {
      setHistoryError("Network error while adding flashcard.");
    } finally {
      setHistoryActionId(null);
    }
  }

  async function removeFlashcardById(
    flashcardId: string,
    options?: { historyId?: string; fromFlashcardsView?: boolean },
  ) {
    if (removingFlashcardId || historyActionId) {
      return;
    }

    if (options?.historyId) {
      setHistoryActionId(options.historyId);
    }
    setRemovingFlashcardId(flashcardId);
    setFlashcardsError(null);
    setHistoryError(null);

    try {
      const response = await fetch("/api/flashcards", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ flashcardId }),
      });

      const payload = (await response.json()) as RemoveFlashcardSuccess | DefineApiError;
      if (!response.ok) {
        const fallbackMessage = "Unable to remove flashcard.";
        setFlashcardsError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage,
        );
        return;
      }

      setFlashcards((current) => current.filter((item) => item.id !== flashcardId));
      setHistoryItems((current) =>
        current.map((item) =>
          item.flashcard?.id === flashcardId
            ? {
                ...item,
                flashcard: null,
              }
            : item,
        ),
      );
      setExpandedFlashcardId((current) => (current === flashcardId ? null : current));
    } catch {
      if (options?.fromFlashcardsView) {
        setFlashcardsError("Network error while removing flashcard.");
      } else {
        setHistoryError("Network error while removing flashcard.");
      }
    } finally {
      setRemovingFlashcardId(null);
      setHistoryActionId(null);
    }
  }

  async function toggleHistoryFlashcard(item: HistoryItem) {
    if (item.flashcard) {
      await removeFlashcardById(item.flashcard.id, { historyId: item.id });
      return;
    }

    await addFlashcard(item);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    if (activeView === "flashcards" && flashcards.length === 0 && !isFlashcardsLoading) {
      void loadFlashcards();
    }
  }, [activeView, flashcards.length, isFlashcardsLoading]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/define", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ phrase }),
      });

      const payload = (await response.json()) as
        | DefineApiSuccess
        | DefineApiError;

      if (!response.ok) {
        const fallbackMessage = "Something went wrong while defining the word.";
        setError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage
        );
        return;
      }

      const successPayload = payload as DefineApiSuccess;
      setResult(successPayload);
      setActiveView("define");

      const historyItem = successPayload.historyItem;
      if (historyItem) {
        setHistoryItems((previous) => mergeHistory(previous, [historyItem]));
      } else {
        void loadHistory();
      }
    } catch {
      setError("Network error while calling /api/define.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="home-workspace">
      <div className="w-full rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-3 gap-1">
          <Button
            type="button"
            size="lg"
            variant={activeView === "define" ? "default" : "ghost"}
            className="h-11 rounded-xl text-base font-semibold"
            onClick={() => {
              setActiveView("define");
            }}
          >
            Define
          </Button>
          <Button
            type="button"
            size="lg"
            variant={activeView === "history" ? "default" : "ghost"}
            className="h-11 rounded-xl text-base font-semibold"
            onClick={() => {
              setActiveView("history");
            }}
          >
            History
          </Button>
          <Button
            type="button"
            size="lg"
            variant={activeView === "flashcards" ? "default" : "ghost"}
            className="h-11 rounded-xl text-base font-semibold"
            onClick={() => {
              setActiveView("flashcards");
            }}
          >
            Flashcards
          </Button>
        </div>
      </div>

      {activeView === "define" ? (
        <>
          <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
            <div className="home-input-row">
              <textarea
                id="phrase"
                name="phrase"
                rows={3}
                placeholder="Enter a phrase with an *esoteric* word in it"
                autoComplete="off"
                className="home-textarea"
                value={phrase}
                onChange={(event) => {
                  setPhrase(event.target.value);
                  adjustTextareaHeight(event.target);
                }}
                disabled={isLoading}
              />
              <Button
                type="submit"
                className="home-submit-button h-12 shrink-0 rounded-xl"
                disabled={isLoading}
              >
                {isLoading ? "Defining..." : "Define"}
              </Button>
            </div>

            {preview ? (
              <div className="home-preview">
                <p className="home-preview-label">Preview</p>
                <div className="home-preview-text">
                  {preview.before}
                  <span className="home-preview-mark">
                    {preview.marked}
                  </span>
                  {preview.after}
                </div>
              </div>
            ) : null}
          </form>

          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="home-result">
              {result.structured ? (
                <>
                  <div className="home-result-block mt-[14px] first:mt-0">
                    <div className="home-result-label">Word</div>
                    <div className="home-result-word">{result.structured.word}</div>
                  </div>

                  <div className="home-result-block mt-[14px] first:mt-0">
                    <div className="home-result-label">Meaning</div>
                    <div className="leading-[1.6]">{result.structured.meaning}</div>
                  </div>

                  <div className="home-result-block mt-[14px] first:mt-0">
                    <div className="home-result-label">More Use Cases Alike</div>
                    <ul className="home-result-list">
                      {result.structured.examples.map((example, index) => (
                        <li key={`${example}-${index}`} className="mb-[6px]">
                          {example}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="home-result-block mt-[14px] first:mt-0">
                  <div className="home-result-label">Result</div>
                  <div className="leading-[1.6]">
                    {result.fallbackText ??
                      result.definition?.meaning ??
                      "No structured result available."}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {activeView === "history" ? (
        <section className="mt-4 rounded-2xl border border-slate-200/85 bg-white/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="home-result-label !mb-1">Recent Lookups</p>
              <p className="text-sm text-slate-600">
                Sentence + add button only.
              </p>
            </div>
            {isHistoryLoading ? (
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Loading...
              </span>
            ) : null}
          </div>

          {historyError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {historyError}
            </p>
          ) : null}

          {!isHistoryLoading && historyItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No history yet. Define a phrase to start.</p>
          ) : null}

          <div className="mt-3 flex flex-col gap-3">
            {historyItems.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm leading-[1.6] text-slate-700">
                    {renderHighlightedSentence(item.phraseInput, item.targetText)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={item.flashcard ? "secondary" : "outline"}
                    className="rounded-xl"
                    disabled={
                      historyActionId === item.id ||
                      (item.flashcard ? removingFlashcardId === item.flashcard.id : false)
                    }
                    onClick={() => {
                      void toggleHistoryFlashcard(item);
                    }}
                  >
                    {item.flashcard ? "Added" : "Add Flashcard"}
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {historyCursor ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isHistoryLoadingMore}
                onClick={() => {
                  void loadHistory({ cursor: historyCursor, append: true });
                }}
              >
                {isHistoryLoadingMore ? "Loading..." : "Load More"}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "flashcards" ? (
        <section className="mt-4 rounded-2xl border border-slate-200/85 bg-white/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="home-result-label !mb-1">Flashcards</p>
              <p className="text-sm text-slate-600">
                Tap a word to reveal its saved content.
              </p>
            </div>
            {isFlashcardsLoading ? (
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Loading...
              </span>
            ) : null}
          </div>

          {flashcardsError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {flashcardsError}
            </p>
          ) : null}

          {!isFlashcardsLoading && flashcards.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No flashcards yet. Add one from history.
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-3">
            {flashcards.map((card) => {
              const isExpanded = expandedFlashcardId === card.id;
              return (
                <article
                  key={card.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        setExpandedFlashcardId((current) =>
                          current === card.id ? null : card.id,
                        );
                      }}
                    >
                      <p className="text-lg font-semibold text-slate-800">{card.term}</p>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      disabled={removingFlashcardId === card.id}
                      onClick={() => {
                        void removeFlashcardById(card.id, { fromFlashcardsView: true });
                      }}
                    >
                      Remove
                    </Button>
                  </div>

                  {isExpanded && card.content ? (
                    <div className="mt-2.5 border-t border-slate-200 pt-2.5">
                      {card.content.structured ? (
                        <div className="home-result">
                          <div className="home-result-block mt-[14px] first:mt-0">
                            <div className="home-result-label">Word</div>
                            <div className="home-result-word">{card.content.structured.word}</div>
                          </div>

                          <div className="home-result-block mt-[14px] first:mt-0">
                            <div className="home-result-label">Meaning</div>
                            <div className="leading-[1.6]">{card.content.structured.meaning}</div>
                          </div>

                          <div className="home-result-block mt-[14px] first:mt-0">
                            <div className="home-result-label">More Use Cases Alike</div>
                            <ul className="home-result-list">
                              {card.content.structured.examples.map((example, index) => (
                                <li key={`${example}-${index}`} className="mb-[6px]">
                                  {example}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="home-result">
                          <div className="home-result-block mt-[14px] first:mt-0">
                            <div className="home-result-label">Word</div>
                            <div className="home-result-word">
                              {card.content.word ?? card.content.targetText}
                            </div>
                          </div>
                          <div className="home-result-block mt-[14px] first:mt-0">
                            <div className="home-result-label">Meaning</div>
                            <div className="leading-[1.6]">
                              {card.content.fallbackText ??
                                card.content.definition?.meaning ??
                                card.content.resultPreview ??
                                "No saved content available."}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <p className="home-result-label">Original Sentence</p>
                        <p className="text-sm leading-[1.6] text-slate-700">
                          {renderHighlightedSentence(
                            card.content.phraseInput,
                            card.content.targetText,
                          )}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
