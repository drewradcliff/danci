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
  flashcardId?: string;
};

type PreviewParts = {
  before: string;
  marked: string;
  after: string;
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
  const [activeView, setActiveView] = useState<"define" | "history">("define");
  const [phrase, setPhrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DefineApiSuccess | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [togglingHistoryId, setTogglingHistoryId] = useState<string | null>(null);
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

  function formatTimestamp(value: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return value;
    }

    const diffMs = timestamp.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    const absMinutes = Math.abs(diffMinutes);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

    if (absMinutes < 60) {
      return rtf.format(diffMinutes, "minute");
    }

    const diffHours = Math.round(diffMinutes / 60);
    const absHours = Math.abs(diffHours);
    if (absHours < 24) {
      return rtf.format(diffHours, "hour");
    }

    const diffDays = Math.round(diffHours / 24);
    return rtf.format(diffDays, "day");
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

  async function toggleFlashcard(item: HistoryItem) {
    if (togglingHistoryId) {
      return;
    }

    setTogglingHistoryId(item.id);
    setHistoryError(null);

    const previousItems = historyItems;
    const nextActive = item.flashcard === null;
    const optimistic = historyItems.map((historyItem) =>
      historyItem.id === item.id
        ? {
            ...historyItem,
            flashcard: nextActive
              ? {
                  id: historyItem.flashcard?.id ?? `pending-${historyItem.id}`,
                  term: historyItem.targetText,
                }
              : null,
          }
        : historyItem,
    );
    setHistoryItems(optimistic);

    try {
      const response = await fetch("/api/flashcards/toggle", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ lookupHistoryId: item.id }),
      });

      const payload = (await response.json()) as ToggleFlashcardSuccess | DefineApiError;
      if (!response.ok) {
        const fallbackMessage = "Unable to toggle flashcard.";
        setHistoryItems(previousItems);
        setHistoryError(
          "error" in payload ? payload.error.message ?? fallbackMessage : fallbackMessage,
        );
        return;
      }

      const togglePayload = payload as ToggleFlashcardSuccess;
      setHistoryItems((current) =>
        current.map((historyItem) =>
          historyItem.id === item.id
            ? {
                ...historyItem,
                flashcard: togglePayload.active
                  ? {
                      id: togglePayload.flashcardId ?? historyItem.flashcard?.id ?? item.id,
                      term: historyItem.targetText,
                    }
                  : null,
              }
            : historyItem,
        ),
      );
    } catch {
      setHistoryItems(previousItems);
      setHistoryError("Network error while toggling flashcard.");
    } finally {
      setTogglingHistoryId(null);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="signin-kicker signin-kicker-soft">Word Desk</p>
          <h2 className="home-label">Define or browse history</h2>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
          <Button
            type="button"
            size="sm"
            variant={activeView === "define" ? "default" : "ghost"}
            className="rounded-full"
            onClick={() => {
              setActiveView("define");
            }}
          >
            Define
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeView === "history" ? "default" : "ghost"}
            className="rounded-full"
            onClick={() => {
              setActiveView("history");
            }}
          >
            History
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
                Every successful lookup appears here, newest first.
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{item.targetText}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatTimestamp(item.createdAt)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={item.flashcard ? "default" : "outline"}
                    className="rounded-xl"
                    disabled={togglingHistoryId === item.id}
                    onClick={() => {
                      void toggleFlashcard(item);
                    }}
                  >
                    {item.flashcard ? "Flashcard Added" : "Add Flashcard"}
                  </Button>
                </div>
                <p className="mt-2 text-sm leading-[1.55] text-slate-700">
                  {item.resultPreview ?? "No preview available."}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">{item.phraseInput}</p>
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
    </section>
  );
}
