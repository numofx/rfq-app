import { NextResponse } from "next/server";
import type { BookLevel, ForwardBook } from "@/lib/forward-quote";

export const dynamic = "force-dynamic";

// The markets service sends no CORS headers, so the browser reads it through here.
const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";
const MARKET = "cNGN-30NOV26";
const TIMEOUT_MS = 4000;
// amount_scale is what one unit of size is signed as, out of 1e18 a contract.
const CONTRACT_SCALE = 1e18;

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
  taker_fee_bps?: number;
  expiry_timestamp?: number;
  contract_multiplier?: string;
  amount_scale?: string;
  fill_band_low?: string;
  fill_band_high?: string;
  future?: { trading_open?: boolean; band_status?: string; index_price?: string };
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

/** What can fill: orders with size left, at a price inside the band the chain accepts. */
function toLevels(orders: BookOrder[], listing: MarketListing, cngnPerUnit: number): BookLevel[] {
  const low = Number(listing.fill_band_low ?? 0);
  const high = Number(listing.fill_band_high ?? Infinity);
  return orders
    .map((order) => ({
      price: Number(order.limit_price),
      size: (Number(order.desired_amount) - Number(order.filled_amount ?? 0)) * cngnPerUnit,
    }))
    .filter(({ price, size }) => price > 0 && size > 0 && price >= low && price <= high);
}

export async function GET() {
  try {
    const [book, listings] = await Promise.all([
      fetchJson<BookResponse>(`/book?symbol=${MARKET}`),
      fetchJson<MarketListing[]>("/markets"),
    ]);

    const listing = listings.find(({ market }) => market === MARKET);
    const indexPrice = Number(listing?.future?.index_price);
    const cngnPerUnit = (Number(listing?.contract_multiplier) * Number(listing?.amount_scale)) / CONTRACT_SCALE;
    const takerFeeBps = listing?.taker_fee_bps;
    const expiresAt = listing?.expiry_timestamp;

    // A quote missing any of these would understate the cost, so there is no quote at all.
    if (!listing || !(indexPrice > 0) || !(cngnPerUnit > 0) || typeof takerFeeBps !== "number" || !expiresAt) {
      throw new Error(`${MARKET} is missing from /markets or incomplete`);
    }

    const bids = toLevels(book.bids, listing, cngnPerUnit).sort((a, b) => b.price - a.price);
    const asks = toLevels(book.asks, listing, cngnPerUnit).sort((a, b) => a.price - b.price);
    const isOpen = listing.future?.trading_open === true && listing.future?.band_status === "ok";
    const isCrossed = bids.length > 0 && asks.length > 0 && bids[0].price >= asks[0].price;
    const isQuotable = isOpen && !isCrossed;

    const payload: ForwardBook = {
      bids: isQuotable ? bids : [],
      asks: isQuotable ? asks : [],
      indexPrice,
      takerFeeBps,
      expiresAt,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read the forward book", error);
    return NextResponse.json({ error: "forward rate unavailable" }, { status: 502 });
  }
}
