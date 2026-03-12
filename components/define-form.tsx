"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  addFlashcard as addFlashcardRequest,
  ApiClientError,
  deleteHistory as deleteHistoryRequest,
  definePhrase,
  fetchFlashcards,
  fetchHistory,
  queryKeys,
  removeFlashcard as removeFlashcardRequest,
  type DeleteHistorySuccess,
  type DefineApiSuccess,
  type FlashcardItem,
  type HistoryApiSuccess,
  type HistoryItem,
  type RemoveFlashcardSuccess,
  type ToggleFlashcardSuccess,
} from "@/lib/client-api";

type PreviewParts = {
  before: string;
  marked: string;
  after: string;
};

const HISTORY_PAGE_SIZE = 20;

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

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return error.message || fallbackMessage;
  }

  if (error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function mapHistoryPages(
  data: InfiniteData<HistoryApiSuccess, string | null> | undefined,
  mapItem: (item: HistoryItem) => HistoryItem,
) {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map(mapItem),
    })),
  };
}

function prependHistoryItem(
  data: InfiniteData<HistoryApiSuccess, string | null> | undefined,
  item: HistoryItem,
): InfiniteData<HistoryApiSuccess, string | null> {
  if (!data || data.pages.length === 0) {
    return {
      pageParams: [null],
      pages: [
        {
          items: [item],
          nextCursor: null,
        },
      ],
    };
  }

  const [firstPage, ...restPages] = data.pages;

  return {
    ...data,
    pages: [
      {
        ...firstPage,
        items: mergeHistory(firstPage.items, [item]),
      },
      ...restPages,
    ],
  };
}

function replaceOrPrependFlashcard(
  cards: FlashcardItem[] | undefined,
  card: FlashcardItem,
  options?: { removeId?: string },
) {
  const filtered = (cards ?? []).filter(
    (current) => current.id !== card.id && current.id !== options?.removeId,
  );

  return [card, ...filtered];
}

function createOptimisticFlashcard(item: HistoryItem, flashcardId: string): FlashcardItem {
  return {
    id: flashcardId,
    term: item.targetText,
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
  };
}

export function DefineForm() {
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = useState<"define" | "history" | "flashcards">(
    "define",
  );
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DefineApiSuccess | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const [flashcardsActionError, setFlashcardsActionError] = useState<string | null>(null);
  const [expandedFlashcardId, setExpandedFlashcardId] = useState<string | null>(null);

  const preview = getPreviewParts(phrase);

  const historyQuery = useInfiniteQuery({
    queryKey: queryKeys.history(HISTORY_PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      fetchHistory({ cursor: pageParam, limit: HISTORY_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const flashcardsQuery = useQuery({
    queryKey: queryKeys.flashcards(),
    queryFn: fetchFlashcards,
    select: (data) => data.items,
  });

  const addFlashcardMutation = useMutation<
    ToggleFlashcardSuccess,
    Error,
    HistoryItem,
    {
      previousHistory?: InfiniteData<HistoryApiSuccess, string | null>;
      previousFlashcards?: FlashcardItem[];
      optimisticFlashcardId: string;
    }
  >({
    mutationFn: (item) => addFlashcardRequest(item.id),
    onMutate: async (item) => {
      setHistoryActionError(null);
      setFlashcardsActionError(null);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.cancelQueries({ queryKey: queryKeys.flashcards() }),
      ]);

      const previousHistory = queryClient.getQueryData<
        InfiniteData<HistoryApiSuccess, string | null>
      >(queryKeys.history(HISTORY_PAGE_SIZE));
      const previousFlashcards = queryClient.getQueryData<FlashcardItem[]>(
        queryKeys.flashcards(),
      );

      const optimisticFlashcardId = `optimistic-${item.id}`;

      queryClient.setQueryData<InfiniteData<HistoryApiSuccess, string | null>>(
        queryKeys.history(HISTORY_PAGE_SIZE),
        (current) =>
          mapHistoryPages(current, (historyItem) =>
            historyItem.id === item.id
              ? {
                  ...historyItem,
                  flashcard: {
                    id: optimisticFlashcardId,
                    term: item.targetText,
                  },
                }
              : historyItem,
          ),
      );

      queryClient.setQueryData<FlashcardItem[]>(queryKeys.flashcards(), (current) =>
        replaceOrPrependFlashcard(
          current,
          createOptimisticFlashcard(item, optimisticFlashcardId),
        ),
      );

      return {
        previousHistory,
        previousFlashcards,
        optimisticFlashcardId,
      };
    },
    onError: (mutationError, _item, context) => {
      if (context?.previousHistory) {
        queryClient.setQueryData(queryKeys.history(HISTORY_PAGE_SIZE), context.previousHistory);
      }
      if (context?.previousFlashcards) {
        queryClient.setQueryData(queryKeys.flashcards(), context.previousFlashcards);
      }

      setHistoryActionError(getErrorMessage(mutationError, "Unable to add flashcard."));
    },
    onSuccess: (payload, item, context) => {
      const flashcardId = payload.flashcardId ?? context?.optimisticFlashcardId ?? item.id;
      const term = payload.term ?? item.targetText;

      queryClient.setQueryData<InfiniteData<HistoryApiSuccess, string | null>>(
        queryKeys.history(HISTORY_PAGE_SIZE),
        (current) =>
          mapHistoryPages(current, (historyItem) =>
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

      queryClient.setQueryData<FlashcardItem[]>(queryKeys.flashcards(), (current) =>
        replaceOrPrependFlashcard(
          current,
          {
            ...(current?.find((card) => card.id === context?.optimisticFlashcardId) ??
              createOptimisticFlashcard(item, flashcardId)),
            id: flashcardId,
            term,
          },
          { removeId: context?.optimisticFlashcardId },
        ),
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.flashcards() }),
      ]);
    },
  });

  const removeFlashcardMutation = useMutation<
    RemoveFlashcardSuccess,
    Error,
    {
      flashcardId: string;
      historyId?: string;
      fromFlashcardsView?: boolean;
    },
    {
      previousHistory?: InfiniteData<HistoryApiSuccess, string | null>;
      previousFlashcards?: FlashcardItem[];
    }
  >({
    mutationFn: ({ flashcardId }) => removeFlashcardRequest(flashcardId),
    onMutate: async ({ flashcardId }) => {
      setHistoryActionError(null);
      setFlashcardsActionError(null);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.cancelQueries({ queryKey: queryKeys.flashcards() }),
      ]);

      const previousHistory = queryClient.getQueryData<
        InfiniteData<HistoryApiSuccess, string | null>
      >(queryKeys.history(HISTORY_PAGE_SIZE));
      const previousFlashcards = queryClient.getQueryData<FlashcardItem[]>(
        queryKeys.flashcards(),
      );

      queryClient.setQueryData<InfiniteData<HistoryApiSuccess, string | null>>(
        queryKeys.history(HISTORY_PAGE_SIZE),
        (current) =>
          mapHistoryPages(current, (historyItem) =>
            historyItem.flashcard?.id === flashcardId
              ? {
                  ...historyItem,
                  flashcard: null,
                }
              : historyItem,
          ),
      );

      queryClient.setQueryData<FlashcardItem[]>(queryKeys.flashcards(), (current) =>
        (current ?? []).filter((item) => item.id !== flashcardId),
      );

      return {
        previousHistory,
        previousFlashcards,
      };
    },
    onError: (mutationError, variables, context) => {
      if (context?.previousHistory) {
        queryClient.setQueryData(queryKeys.history(HISTORY_PAGE_SIZE), context.previousHistory);
      }
      if (context?.previousFlashcards) {
        queryClient.setQueryData(queryKeys.flashcards(), context.previousFlashcards);
      }

      const message = getErrorMessage(mutationError, "Unable to remove flashcard.");
      if (variables.fromFlashcardsView) {
        setFlashcardsActionError(message);
      } else {
        setHistoryActionError(message);
      }
    },
    onSuccess: (_, variables) => {
      setExpandedFlashcardId((current) =>
        current === variables.flashcardId ? null : current,
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.flashcards() }),
      ]);
    },
  });

  const defineMutation = useMutation({
    mutationFn: definePhrase,
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: async (payload) => {
      setResult(payload);
      setActiveView("define");

      if (payload.historyItem) {
        queryClient.setQueryData<InfiniteData<HistoryApiSuccess, string | null>>(
          queryKeys.history(HISTORY_PAGE_SIZE),
          (current) => prependHistoryItem(current, payload.historyItem!),
        );
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.history(HISTORY_PAGE_SIZE),
      });
    },
    onError: (mutationError) => {
      setError(
        getErrorMessage(mutationError, "Something went wrong while defining the word."),
      );
    },
  });

  const deleteHistoryMutation = useMutation<
    DeleteHistorySuccess,
    Error,
    { historyId: string; flashcardId?: string },
    {
      previousHistory?: InfiniteData<HistoryApiSuccess, string | null>;
      previousFlashcards?: FlashcardItem[];
    }
  >({
    mutationFn: ({ historyId }) => deleteHistoryRequest(historyId),
    onMutate: async ({ historyId, flashcardId }) => {
      setHistoryActionError(null);
      setFlashcardsActionError(null);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.cancelQueries({ queryKey: queryKeys.flashcards() }),
      ]);

      const previousHistory = queryClient.getQueryData<
        InfiniteData<HistoryApiSuccess, string | null>
      >(queryKeys.history(HISTORY_PAGE_SIZE));
      const previousFlashcards = queryClient.getQueryData<FlashcardItem[]>(
        queryKeys.flashcards(),
      );

      queryClient.setQueryData<InfiniteData<HistoryApiSuccess, string | null>>(
        queryKeys.history(HISTORY_PAGE_SIZE),
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== historyId),
            })),
          };
        },
      );

      queryClient.setQueryData<FlashcardItem[]>(queryKeys.flashcards(), (current) =>
        (current ?? []).filter(
          (item) =>
            item.lookupHistoryId !== historyId && (!flashcardId || item.id !== flashcardId),
        ),
      );

      return {
        previousHistory,
        previousFlashcards,
      };
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousHistory) {
        queryClient.setQueryData(queryKeys.history(HISTORY_PAGE_SIZE), context.previousHistory);
      }
      if (context?.previousFlashcards) {
        queryClient.setQueryData(queryKeys.flashcards(), context.previousFlashcards);
      }

      setHistoryActionError(
        getErrorMessage(mutationError, "Unable to delete history entry."),
      );
    },
    onSuccess: (payload, variables) => {
      const removedFlashcardIds = new Set(payload.removedFlashcardIds ?? []);
      if (variables.flashcardId) {
        removedFlashcardIds.add(variables.flashcardId);
      }

      if (removedFlashcardIds.size > 0) {
        queryClient.setQueryData<FlashcardItem[]>(queryKeys.flashcards(), (current) =>
          (current ?? []).filter((item) => !removedFlashcardIds.has(item.id)),
        );
      }

      setExpandedFlashcardId((current) =>
        current && removedFlashcardIds.has(current) ? null : current,
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.history(HISTORY_PAGE_SIZE) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.flashcards() }),
      ]);
    },
  });

  const historyItems = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const flashcards = flashcardsQuery.data ?? [];
  const isLoading = defineMutation.isPending;
  const isHistoryLoading = historyQuery.isPending && !historyQuery.data;
  const isHistoryLoadingMore = historyQuery.isFetchingNextPage;
  const isFlashcardsLoading = flashcardsQuery.isPending && !flashcardsQuery.data;
  const historyError =
    historyActionError ??
    (historyQuery.error
      ? getErrorMessage(historyQuery.error, "Unable to load history.")
      : null);
  const flashcardsError =
    flashcardsActionError ??
    (flashcardsQuery.error
      ? getErrorMessage(flashcardsQuery.error, "Unable to load flashcards.")
      : null);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await defineMutation.mutateAsync(phrase);
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
                  <span className="home-preview-mark">{preview.marked}</span>
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
              <p className="text-sm text-slate-600">Sentence + actions.</p>
            </div>
            {historyQuery.isFetching ? (
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
            {historyItems.map((item) => {
              const isAdding =
                addFlashcardMutation.isPending && addFlashcardMutation.variables?.id === item.id;
              const isRemoving =
                removeFlashcardMutation.isPending &&
                item.flashcard !== null &&
                removeFlashcardMutation.variables?.flashcardId === item.flashcard.id;
              const isDeleting =
                deleteHistoryMutation.isPending &&
                deleteHistoryMutation.variables?.historyId === item.id;

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm leading-[1.6] text-slate-700">
                      {renderHighlightedSentence(item.phraseInput, item.targetText)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={item.flashcard ? "secondary" : "outline"}
                        className="rounded-xl"
                        disabled={isAdding || isRemoving || isDeleting}
                        onClick={() => {
                          if (item.flashcard) {
                            removeFlashcardMutation.mutate({
                              flashcardId: item.flashcard.id,
                              historyId: item.id,
                            });
                            return;
                          }

                          addFlashcardMutation.mutate(item);
                        }}
                      >
                        {item.flashcard ? "Added" : "Add Flashcard"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={isAdding || isRemoving || isDeleting}
                        onClick={() => {
                          deleteHistoryMutation.mutate({
                            historyId: item.id,
                            flashcardId: item.flashcard?.id,
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {historyQuery.hasNextPage ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isHistoryLoadingMore}
                onClick={() => {
                  void historyQuery.fetchNextPage();
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
              <p className="text-sm text-slate-600">Tap a word to reveal its saved content.</p>
            </div>
            {flashcardsQuery.isFetching ? (
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

          {isFlashcardsLoading ? (
            <p className="mt-3 text-sm text-slate-600">Loading flashcards...</p>
          ) : null}

          {!isFlashcardsLoading && flashcards.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No flashcards yet. Add one from history.</p>
          ) : null}

          <div className="mt-3 flex flex-col gap-3">
            {flashcards.map((card) => {
              const isExpanded = expandedFlashcardId === card.id;
              const isRemoving =
                removeFlashcardMutation.isPending &&
                removeFlashcardMutation.variables?.flashcardId === card.id;

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
                        setExpandedFlashcardId((current) => (current === card.id ? null : card.id));
                      }}
                    >
                      <p className="text-lg font-semibold text-slate-800">{card.term}</p>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      disabled={isRemoving}
                      onClick={() => {
                        removeFlashcardMutation.mutate({
                          flashcardId: card.id,
                          historyId: card.lookupHistoryId ?? undefined,
                          fromFlashcardsView: true,
                        });
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
