import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import type { BookLevel } from "@/lib/forward-quote";
import { FUTURE_SYMBOL, SPOT_SYMBOL, type VenueMarket } from "@/lib/venue/market";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";
const TIMEOUT_MS = 4000;
const SYMBOLS: readonly string[] = [SPOT_SYMBOL, FUTURE_SYMBOL];

interface BookOrder {
  limit_price: string;
  desired_amount: string;
  filled_amount?: string;
}

interface Listing {
  market: string;
  asset_address?: string;
  sub_id?: string;
  trade_module_address?: string;
  margin_manager_address?: string;
  quote_asset_address?: string;
  amount_scale?: string;
  contract_multiplier?: string;
  taker_fee_bps?: number;
  fill_band_low?: string | null;
  fill_band_high?: string | null;
  future?: {
    trading_open?: boolean;
    band_status?: string;
    last_trade_time?: number;
    contract_size?: string;
  } | null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MARKETS_API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`markets service ${path} responded ${response.status}`);
  return (await response.json()) as T;
}

function address(value: string | undefined) {
  if (!value || !isAddress(value)) throw new Error("listing names an invalid address");
  return getAddress(value);
}

function toLevels(orders: BookOrder[], band: VenueMarket["fillBand"]): BookLevel[] {
  return orders
    .map((order) => ({ price: Number(order.limit_price), size: Number(order.desired_amount) - Number(order.filled_amount ?? 0) }))
    .filter(({ price, size }) => price > 0 && size > 0 && (band === null || (price >= band.low && price <= band.high)));
}

/** A market's order parameters and live book, for signing an order against. */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: "unknown market" }, { status: 400 });
  }

  try {
    const [book, listings] = await Promise.all([
      fetchJson<{ bids: BookOrder[]; asks: BookOrder[] }>(`/book?symbol=${encodeURIComponent(symbol)}`),
      fetchJson<Listing[]>("/markets"),
    ]);
    const listing = listings.find(({ market }) => market === symbol);
    if (!listing || typeof listing.taker_fee_bps !== "number" || !listing.amount_scale || !listing.sub_id) {
      throw new Error(`${symbol} is missing from /markets or incomplete`);
    }

    const isFuture = symbol === FUTURE_SYMBOL;
    const low = Number(listing.fill_band_low);
    const high = Number(listing.fill_band_high);
    const fillBand = isFuture && low > 0 && high > low ? { low, high } : null;
    const contractSize = isFuture ? Number(listing.future?.contract_size) : null;
    const unitCngn = (Number(listing.contract_multiplier) * Number(listing.amount_scale)) / 1e18;
    if (!(unitCngn > 0) || (isFuture && !(Number(contractSize) > 0))) {
      throw new Error(`${symbol} has no usable size`);
    }

    const bids = toLevels(book.bids, fillBand).sort((a, b) => b.price - a.price);
    const asks = toLevels(book.asks, fillBand).sort((a, b) => a.price - b.price);
    const isCrossed = bids.length > 0 && asks.length > 0 && bids[0].price >= asks[0].price;
    const lastTradeTime = isFuture ? (listing.future?.last_trade_time ?? null) : null;
    const isOpen =
      !isCrossed &&
      (!isFuture ||
        (listing.future?.trading_open === true &&
          listing.future?.band_status === "ok" &&
          fillBand !== null &&
          lastTradeTime !== null &&
          Date.now() / 1000 < lastTradeTime));

    const market: VenueMarket = {
      symbol: symbol as VenueMarket["symbol"],
      assetAddress: address(listing.asset_address),
      subId: listing.sub_id,
      tradeModuleAddress: address(listing.trade_module_address),
      managerAddress: address(listing.margin_manager_address),
      cashAddress: address(listing.quote_asset_address),
      amountScale: listing.amount_scale,
      unitCngn,
      takerFeeBps: listing.taker_fee_bps,
      fillBand,
      contractSize,
      lastTradeTime,
      isOpen,
      bids: isOpen ? bids : [],
      asks: isOpen ? asks : [],
    };
    return NextResponse.json(market, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Failed to read ${symbol}`, error);
    return NextResponse.json({ error: "market unavailable" }, { status: 502 });
  }
}
