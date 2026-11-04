import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The markets service sends no CORS headers, so the browser reads it through here.
const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";
const MARKET = "cNGN-30NOV26";
const TIMEOUT_MS = 4000;

interface BookOrder {
  limit_price: string;
  desired_amount: string;
  filled_amount?: string;
}

interface BookResponse {
  bids: BookOrder[];
  asks: BookOrder[];
}

interface MarketListing {
  market: string;
  future?: { trading_open?: boolean };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MARKETS_API_URL}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`markets service ${path} responded ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Prices with size still resting, in USDC per cNGN. */
const restingPrices = (orders: BookOrder[]) =>
  orders
    .filter((order) => Number(order.desired_amount) > Number(order.filled_amount ?? 0))
    .map((order) => Number(order.limit_price))
    .filter((price) => Number.isFinite(price) && price > 0);

export async function GET() {
  try {
    const [book, listings] = await Promise.all([
      fetchJson<BookResponse>(`/book?symbol=${MARKET}`),
      fetchJson<MarketListing[]>("/markets"),
    ]);

    const isOpen = listings.find(({ market }) => market === MARKET)?.future?.trading_open === true;
    const bids = restingPrices(book.bids);
    const asks = restingPrices(book.asks);
    const bid = bids.length > 0 ? Math.max(...bids) : null;
    const ask = asks.length > 0 ? Math.min(...asks) : null;
    const isCrossed = bid !== null && ask !== null && bid >= ask;
    const isQuotable = isOpen && !isCrossed;

    return NextResponse.json(
      { market: MARKET, bid: isQuotable ? bid : null, ask: isQuotable ? ask : null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to read the forward book", error);
    return NextResponse.json({ error: "forward rate unavailable" }, { status: 502 });
  }
}
