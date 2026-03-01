"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DefineApiSuccess = {
  phrase: string;
  context: string;
  word: string;
  definition: {
    meaning: string;
    examples: string[];
  };
  meta: {
    definitionsFound: number;
    selectedIndex: number;
    usedFallback: boolean;
  };
};

type DefineApiError = {
  error: {
    code: string;
    message: string;
  };
};

export function DefineForm() {
  const [phrase, setPhrase] = useState("blades apply a *shear* force that");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DefineApiSuccess | null>(null);

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
        <div className="flex items-center gap-2">
          <Input
            id="phrase"
            name="phrase"
            type="text"
            placeholder="blades apply a *shear* force that"
            autoComplete="off"
            className="h-12"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            disabled={isLoading}
          />
          <Button type="submit" className="h-12 shrink-0" disabled={isLoading}>
            {isLoading ? "Defining..." : "Define"}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Word</p>
            <p className="text-lg font-semibold text-zinc-900">{result.word}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Meaning</p>
            <p className="text-zinc-800">{result.definition.meaning}</p>
          </div>

          {result.definition.examples.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Examples</p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-700">
                {result.definition.examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
