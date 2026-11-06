export type FuturePosition = {
  market: string;
  status: string;
  side: "long" | "short";
  /** Contracts held, positive either way. */
  contracts: number;
  /** The position in cNGN of notional, positive either way. */
  cngn: number;
  notionalUsdc: number;
  /** USDC per cNGN. */
  markPrice: number;
  markUpdatedAt: string | null;
  pendingVmUsdc: number;
  expiresAt: number | null;
};

export type PositionsResponse = {
  futures: FuturePosition[];
  imSurplusUsd: number | null;
  mmSurplusUsd: number | null;
};

/** MarginEngine v2's dated-futures requirements, as a fraction of notional at the mark. */
export const FUTURE_INITIAL_MARGIN_RATE = 0.25;
export const FUTURE_MAINTENANCE_MARGIN_RATE = 0.15;

export type HealthLevel = "healthy" | "watch" | "at-risk";

export type CollateralHealth = {
  /** What the account is worth to the margin engine: its collateral plus the futures' value. */
  equityUsd: number;
  /** Margin held against the open futures, at the initial rate. */
  marginInUseUsd: number;
  /** Free to withdraw or to back new positions. */
  availableUsd: number;
  /** How far equity can fall before the account can be liquidated. */
  bufferUsd: number;
  /** The buffer as a share of equity, 0 to 1. */
  bufferShare: number;
  level: HealthLevel;
};

/**
 * The account's margin position, from the venue's two surpluses. Equity is the maintenance surplus
 * plus the maintenance requirement, which the open futures fix at 15% of notional.
 */
export function collateralHealth(positions: PositionsResponse): CollateralHealth | null {
  const { imSurplusUsd, mmSurplusUsd, futures } = positions;
  if (imSurplusUsd === null || mmSurplusUsd === null) return null;
  const notional = futures.reduce((total, position) => total + position.notionalUsdc, 0);
  const equityUsd = mmSurplusUsd + notional * FUTURE_MAINTENANCE_MARGIN_RATE;
  const bufferUsd = mmSurplusUsd;
  const bufferShare = equityUsd > 0 ? Math.min(Math.max(bufferUsd / equityUsd, 0), 1) : 0;
  let level: HealthLevel = "healthy";
  if (bufferUsd <= 0 || bufferShare < 0.2) level = "at-risk";
  else if (bufferShare < 0.5) level = "watch";
  return {
    equityUsd,
    marginInUseUsd: notional * FUTURE_INITIAL_MARGIN_RATE,
    availableUsd: Math.max(imSurplusUsd, 0),
    bufferUsd,
    bufferShare,
    level,
  };
}

/**
 * The mark at which the account reaches maintenance margin if only this position's price moves,
 * in USDC per cNGN, or null when no price gets there. An estimate: it holds the rest of the account
 * fixed, including any cNGN collateral.
 */
export function liquidationPrice(position: FuturePosition, health: CollateralHealth): number | null {
  const { cngn, markPrice } = position;
  if (!(cngn > 0)) return null;
  // Long: equity + cngn·(p − mark) = MM·cngn·p. Short: equity − cngn·(p − mark) = MM·cngn·p.
  const price =
    position.side === "long"
      ? (cngn * markPrice - health.equityUsd) / (cngn * (1 - FUTURE_MAINTENANCE_MARGIN_RATE))
      : (health.equityUsd + cngn * markPrice) / (cngn * (1 + FUTURE_MAINTENANCE_MARGIN_RATE));
  return price > 0 ? price : null;
}
