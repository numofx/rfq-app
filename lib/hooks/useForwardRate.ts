import { useQuery } from "@tanstack/react-query";
import type { ForwardBook } from "@/lib/forward-quote";

const POLL_MS = 5000;

/** Null while loading or after a failed read, so a stale price is never shown. */
export function useForwardBook() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["forward-book"],
    queryFn: async (): Promise<ForwardBook> => {
      const response = await fetch("/api/forward-rate", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`forward rate responded ${response.status}`);
      }
      return (await response.json()) as ForwardBook;
    },
    staleTime: 0,
    refetchInterval: POLL_MS,
    retry: 1,
  });

  return { book: isError ? null : (data ?? null), isPending };
}
