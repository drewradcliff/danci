import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <section className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
        <form className="flex items-center gap-2">
          <label htmlFor="prompt" className="sr-only">
            Message
          </label>
          <Input
            id="prompt"
            name="prompt"
            type="text"
            placeholder="Enter a phrase"
            autoComplete="off"
            className="h-12"
          />
          <Button type="submit" className="h-12">
            Send
          </Button>
        </form>
      </section>
    </main>
  );
}
