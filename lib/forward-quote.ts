/** Prices are in USDC per cNGN and sizes in cNGN, best price first. */
export interface BookLevel {
  price: number;
  size: number;
}

export interface ForwardBook {
  bids: BookLevel[];
  asks: BookLevel[];
  indexPrice: number;
  takerFeeBps: number;
  // Unix seconds.
  expiresAt: number;
}

export interface ForwardQuote {
  // What the account gets, after the fee, in cNGN per USDC. The other rates are in the same unit.
  rate: number;
  spot: number;
  // The market's forward rate less spot.
  points: number;
  // The rate's move from the fee: lower when buying cNGN, higher when selling it.
  feePoints: number;
  feeRate: number;
  daysToExpiry: number;
  // The forward premium over a year. Null on the day of expiry.
  annualizedPremium: number | null;
  // Null until an amount is entered.
  position: {
    // cNGN when locking from USDC, USDC when locking from cNGN.
    locked: number;
    feeUsdc: number;
    marginUsdc: number;
  } | null;
}

// From the docs (/risk/margin-math). /markets does not serve it.
export const INITIAL_MARGIN_RATE = 0.25;

const SECONDS_PER_DAY = 86_400;
const DAYS_PER_YEAR = 365;
const DUST = 1e-9;

/** The average price to fill `amount`, or the best price with no amount. Null when the book is too thin. */
function averagePrice(levels: BookLevel[], amount: number, currency: "USDC" | "cNGN"): number | null {
  if (amount <= 0) return levels[0]?.price ?? null;

  let remaining = amount;
  let usdc = 0;
  let cngn = 0;
  for (const { price, size } of levels) {
    const available = currency === "USDC" ? size * price : size;
    const taken = Math.min(remaining, available);
    const takenCngn = currency === "USDC" ? taken / price : taken;
    cngn += takenCngn;
    usdc += takenCngn * price;
    remaining -= taken;
    if (remaining <= DUST) return usdc / cngn;
  }
  return null;
}

/**
 * Locking from USDC buys cNGN forward, off the asks. Locking from cNGN sells it, into the bids. `amount` is in the
 * account's currency, and the fee comes out of it. Null when the book cannot fill the amount.
 */
export function quoteForward(
  book: ForwardBook,
  amount: number,
  currency: "USDC" | "cNGN",
  nowMs: number
): ForwardQuote | null {
  const isBuying = currency === "USDC";
  const price = averagePrice(isBuying ? book.asks : book.bids, amount, currency);
  if (price === null) return null;

  const marketRate = 1 / price;
  const spot = 1 / book.indexPrice;
  const feeRate = book.takerFeeBps / 10_000;
  const rate = marketRate * (isBuying ? 1 - feeRate : 1 + feeRate);
  const daysToExpiry = Math.max(0, Math.ceil((book.expiresAt - nowMs / 1000) / SECONDS_PER_DAY));
  const notional = isBuying ? amount : amount * price;

  return {
    rate,
    spot,
    points: marketRate - spot,
    feePoints: rate - marketRate,
    feeRate,
    daysToExpiry,
    annualizedPremium: daysToExpiry > 0 ? ((marketRate / spot - 1) * DAYS_PER_YEAR) / daysToExpiry : null,
    position:
      amount > 0
        ? {
            locked: isBuying ? amount * rate : amount / rate,
            feeUsdc: notional * feeRate,
            marginUsdc: notional * INITIAL_MARGIN_RATE,
          }
        : null,
  };
}
