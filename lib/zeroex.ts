/** The tokens behind the trading account's two balances, as 0x routes them on Base. Both have six decimals. */
export const EXCHANGE_TOKENS = {
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  cNGN: { address: "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F", decimals: 6 },
} as const;

export type ExchangeCurrency = keyof typeof EXCHANGE_TOKENS;

/** The fields of a 0x v2 allowance-holder price or quote that the exchange reads. */
export type ZeroExQuote = {
  liquidityAvailable: boolean;
  sellAmount: string;
  buyAmount: string;
  /** What the swap reverts below: buyAmount less the allowed slippage. */
  minBuyAmount: string;
  /** The contract to approve for the sell token. */
  allowanceTarget?: string;
  fees?: { zeroExFee?: { amount: string; token: string } | null } | null;
  issues?: { allowance?: { actual: string; spender: string } | null } | null;
  /** Present only on a firm quote, which needs a taker. */
  transaction?: { to: `0x${string}`; data: `0x${string}`; value: string; gas?: string | null; gasPrice?: string | null };
};

/**
 * An indicative price for selling `sellUnits` of `sell`, or with `taker` a firm quote whose
 * transaction that address can send.
 */
export async function fetchZeroExQuote({
  sell,
  sellUnits,
  taker,
  signal,
}: {
  sell: ExchangeCurrency;
  sellUnits: bigint;
  taker?: string;
  signal?: AbortSignal;
}): Promise<ZeroExQuote> {
  const buy: ExchangeCurrency = sell === "USDC" ? "cNGN" : "USDC";
  const search = new URLSearchParams({
    sellToken: EXCHANGE_TOKENS[sell].address,
    buyToken: EXCHANGE_TOKENS[buy].address,
    sellAmount: sellUnits.toString(),
  });
  if (taker) search.set("taker", taker);
  const response = await fetch(`/api/0x/quote?${search.toString()}`, { cache: "no-store", signal });
  const body = (await response.json().catch(() => null)) as (ZeroExQuote & { message?: string; name?: string }) | null;
  if (!response.ok || body === null) {
    throw new Error(body?.message || "The exchange rate is unavailable right now.");
  }
  return body;
}
