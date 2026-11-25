import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits } from "viem";
import { EXCHANGE_TOKENS, fetchZeroExQuote, type ExchangeCurrency } from "@/lib/zeroex";

/** About $100 each way: the same reference sells the Exchange dialog prices before an amount is entered. */
const REFERENCE_SELL: Record<ExchangeCurrency, string> = { USDC: "100", cNGN: "150000" };
const RATE_POLL_MS = 60_000;

function useReferencePrice(sell: ExchangeCurrency) {
  const sellUnits = parseUnits(REFERENCE_SELL[sell], EXCHANGE_TOKENS[sell].decimals);
  const { data } = useQuery({
    // Shares the Exchange dialog's cache key, so an open dialog and the dashboard ask 0x once.
    queryKey: ["zeroex-price", sell, sellUnits.toString()],
    queryFn: ({ signal }) => fetchZeroExQuote({ sell, sellUnits, signal }),
    refetchInterval: RATE_POLL_MS,
    retry: 1,
  });
  if (!data?.liquidityAvailable) return null;
  const sold = Number(formatUnits(BigInt(data.sellAmount), EXCHANGE_TOKENS[sell].decimals));
  const bought = Number(formatUnits(BigInt(data.buyAmount), EXCHANGE_TOKENS[sell === "USDC" ? "cNGN" : "USDC"].decimals));
  return sold > 0 && bought > 0 ? { sold, bought } : null;
}

/**
 * USD per cNGN at 0x's mid: the average of what $100 buys and what ₦150,000 sells for, the same routing the
 * Exchange dialog trades through. Null while either side is unknown.
 */
export function useUsdPerCngn(): number | null {
  const buyCngn = useReferencePrice("USDC");
  const sellCngn = useReferencePrice("cNGN");
  if (!buyCngn || !sellCngn) return null;
  const ask = buyCngn.sold / buyCngn.bought; // USD paid per cNGN bought
  const bid = sellCngn.bought / sellCngn.sold; // USD received per cNGN sold
  return (ask + bid) / 2;
}
