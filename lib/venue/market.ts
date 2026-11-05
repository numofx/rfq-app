import type { BookLevel } from "@/lib/forward-quote";

/** The two markets command trades. */
export const SPOT_SYMBOL = "cNGN-USDC";
export const FUTURE_SYMBOL = "cNGN-30NOV26";
export type VenueSymbol = typeof SPOT_SYMBOL | typeof FUTURE_SYMBOL;

/**
 * What placing an order on a market needs, from `/markets` and `/book`. Prices are USDC per cNGN.
 * Book sizes are in venue units: whole cNGN on spot, 1,000 cNGN of notional on the future.
 */
export interface VenueMarket {
  symbol: VenueSymbol;
  assetAddress: `0x${string}`;
  subId: string;
  tradeModuleAddress: `0x${string}`;
  managerAddress: `0x${string}`;
  /** The USDC cash asset margin and spot settle in. */
  cashAddress: `0x${string}`;
  /** What one venue unit is signed as, out of 1e18 a contract or token. */
  amountScale: string;
  /** cNGN in one venue unit. */
  unitCngn: number;
  takerFeeBps: number;
  /** Futures only: the band the venue and chain accept fills inside. */
  fillBand: { low: number; high: number } | null;
  /** Futures only: cNGN in one contract, which the fee ceiling is signed per. */
  contractSize: number | null;
  /** Unix seconds after which the venue takes no orders; null on spot. */
  lastTradeTime: number | null;
  /** False when the venue is not matching the market, or its band cannot be read. */
  isOpen: boolean;
  /** Sizes in venue units, best price first. Empty when the book is crossed or closed. */
  bids: BookLevel[];
  asks: BookLevel[];
}

/** The price `units` venue units fill at the worst level of, or null when the book is too thin. */
export function worstFillPrice(levels: BookLevel[], units: number) {
  let remaining = units;
  for (const level of levels) {
    remaining -= level.size;
    if (remaining <= 1e-9) return level.price;
  }
  return null;
}

/** USDC per cNGN averaged over the levels `units` fill, or null when the book is too thin. */
export function averageFillPrice(levels: BookLevel[], units: number) {
  let remaining = units;
  let cost = 0;
  for (const level of levels) {
    const taken = Math.min(remaining, level.size);
    cost += taken * level.price;
    remaining -= taken;
    if (remaining <= 1e-9) return cost / units;
  }
  return null;
}

/**
 * How many whole venue units `usdc` buys off the asks, after the taker fee, or null when the book
 * runs out first: a smaller order than the amount asked for is not what the user agreed to.
 */
export function unitsForUsdc(asks: BookLevel[], usdc: number, unitCngn: number, feeRate: number) {
  let budget = usdc / (1 + feeRate);
  let units = 0;
  for (const level of asks) {
    const unitCost = level.price * unitCngn;
    const affordable = Math.min(level.size, Math.floor(budget / unitCost + 1e-9));
    units += affordable;
    budget -= affordable * unitCost;
    if (affordable < level.size) return units;
  }
  return null;
}
