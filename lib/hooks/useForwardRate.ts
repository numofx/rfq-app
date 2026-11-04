import { useQuery } from "@tanstack/react-query";

const POLL_MS = 5000;

/** The best prices on the cNGN-30NOV26 book, in USDC per cNGN. Null when that side cannot be quoted. */
export interface ForwardBook {
  bid: number | null;
  ask: number | null;
}

/** Null while loading or after a failed read, so a stale price is never shown as live. */
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
