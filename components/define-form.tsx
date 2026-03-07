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
    <section className="home-workspace">
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1">
          <p className="signin-kicker signin-kicker-soft">Define A Phrase</p>
          <label htmlFor="phrase" className="home-label">
            Phrase with one marked word
          </label>
        </div>
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
    </section>
  );
}
