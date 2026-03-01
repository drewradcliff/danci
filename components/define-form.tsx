"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

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
    usedFallback: boolean;
    jsonParseFailed: boolean;
  };
};

type DefineApiError = {
  error: {
    code: string;
    message: string;
  };
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
  const [phrase, setPhrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DefineApiSuccess | null>(null);
  const preview = getPreviewParts(phrase);

  function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

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

      setResult(payload as DefineApiSuccess);
    } catch {
      setError("Network error while calling /api/define.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label htmlFor="phrase" className="text-sm font-medium text-zinc-700">
          Phrase with one marked word
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="phrase"
            name="phrase"
            rows={3}
            placeholder="Enter a phrase with an *esoteric* word in it"
            autoComplete="off"
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-12 w-full rounded-md border bg-transparent px-3 py-3 text-base shadow-xs outline-none resize-y overflow-auto focus-visible:ring-[3px]"
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value);
              adjustTextareaHeight(event.target);
            }}
            disabled={isLoading}
          />
          <Button type="submit" className="h-12 shrink-0" disabled={isLoading}>
            {isLoading ? "Defining..." : "Define"}
          </Button>
        </div>

        {preview ? (
          <div>
            <p className="mt-2 text-xs text-[#666]">Preview</p>
            <div className="mt-0.5 leading-[1.4]">
              {preview.before}
              <span className="rounded-[3px] bg-[rgba(255,230,150,0.6)] px-0.5 font-semibold">
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
        <div className="mt-[14px] rounded-[10px] bg-[#f7f7f7] px-[18px] py-4">
          {result.structured ? (
            <>
              <div className="mt-[14px] first:mt-0">
                <div className="mb-1.5 text-[11px] tracking-[0.08em] text-[#777]">WORD</div>
                <div className="text-[22px] font-bold">{result.structured.word}</div>
              </div>

              <div className="mt-[14px] first:mt-0">
                <div className="mb-1.5 text-[11px] tracking-[0.08em] text-[#777]">MEANING</div>
                <div className="leading-[1.5]">{result.structured.meaning}</div>
              </div>

              <div className="mt-[14px] first:mt-0">
                <div className="mb-1.5 text-[11px] tracking-[0.08em] text-[#777]">
                  MORE USE CASES ALIKE
                </div>
                <ul className="m-0 list-disc pl-[18px]">
                  {result.structured.examples.map((example, index) => (
                    <li key={`${example}-${index}`} className="mb-[6px]">
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="mt-[14px] first:mt-0">
              <div className="mb-1.5 text-[11px] tracking-[0.08em] text-[#777]">RESULT</div>
              <div className="leading-[1.5]">
                {result.fallbackText ??
                  result.definition?.meaning ??
                  "No structured result available."}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
