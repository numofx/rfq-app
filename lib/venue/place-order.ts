import type { ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { INITIAL_MARGIN_RATE } from "@/lib/forward-quote";
import { getAppChain } from "@/lib/venue/config";
import { averageFillPrice, FUTURE_SYMBOL, unitsForUsdc, worstFillPrice, type VenueMarket } from "@/lib/venue/market";
import { buildSpotOrderEnvelope } from "@/lib/venue/order-envelope";

/** How far through the worst level a market order's limit goes, as trading-app's tickets do. */
const MAX_SLIPPAGE = 0.005;

/**
 * How long an order is signed for. These are market orders: whatever the book cannot fill now
 * should lapse, not rest as a limit order the user never chose to place.
 */
const ORDER_LIFETIME_SECONDS = 120;

/** The fee ceiling signed per contract, as trading-app's FUTURE_WORST_FEE_RATE: 30 bps. */
const FUTURE_WORST_FEE_RATE = 0.003;

const FILL_POLL_INTERVAL_MS = 1000;
const FILL_POLL_TIMEOUT_MS = 15_000;

export type OrderPlan = {
  side: "buy" | "sell";
  /** Whole venue units: cNGN on spot, 1,000 cNGN of notional on the future. */
  units: number;
  /** The signed limit in USDC per cNGN, as a decimal string. */
  limitPrice: string;
  /** The average price the book fills `units` at now, in USDC per cNGN. */
  expectedPrice: number;
  cngn: number;
  notionalUsdc: number;
  feeUsdc: number;
  /** Futures only: the initial margin the position needs. */
  marginUsdc: number | null;
};

/**
 * The order an amount in the account's currency comes to. A USDC account buys cNGN (on the future,
 * goes long cNGN), off the asks; a cNGN account sells it, into the bids. Returns a reason instead
 * when there is no order to place.
 */
export function planOrder(market: VenueMarket, currency: "USDC" | "cNGN", amount: number): OrderPlan | string {
  if (!market.isOpen) return "This market isn't trading right now";
  if (!(amount > 0)) return "Enter an amount";

  const isFuture = market.symbol === FUTURE_SYMBOL;
  const feeRate = market.takerFeeBps / 10_000;
  const side = currency === "USDC" ? "buy" : "sell";
  const levels = side === "buy" ? market.asks : market.bids;
  if (levels.length === 0) return "No liquidity right now";

  let units: number;
  if (currency === "cNGN") {
    units = Math.floor(amount / market.unitCngn + 1e-9);
  } else if (isFuture) {
    // The amount is the USDC notional to lock: re-price once at the average of the first guess.
    const firstGuess = Math.floor(amount / (levels[0].price * market.unitCngn));
    const average = averageFillPrice(levels, Math.max(firstGuess, 1)) ?? levels[0].price;
    units = Math.floor(amount / (average * market.unitCngn));
  } else {
    const affordable = unitsForUsdc(levels, amount, market.unitCngn, feeRate);
    if (affordable === null) return "Not enough liquidity for this amount";
    units = affordable;
  }

  const minimum = isFuture ? `${market.unitCngn.toLocaleString("en-US")} cNGN` : "1 cNGN";
  if (units < 1) return `The minimum is ${minimum}`;

  const worst = worstFillPrice(levels, units);
  const expectedPrice = averageFillPrice(levels, units);
  if (worst === null || expectedPrice === null) return "Not enough liquidity for this amount";

  let limit = side === "buy" ? worst * (1 + MAX_SLIPPAGE) : worst * (1 - MAX_SLIPPAGE);
  if (market.fillBand) {
    limit = Math.min(market.fillBand.high, Math.max(market.fillBand.low, limit));
  }

  const cngn = units * market.unitCngn;
  const notionalUsdc = cngn * expectedPrice;
  return {
    side,
    units,
    limitPrice: limit.toFixed(10),
    expectedPrice,
    cngn,
    notionalUsdc,
    feeUsdc: notionalUsdc * feeRate,
    marginUsdc: isFuture ? notionalUsdc * INITIAL_MARGIN_RATE : null,
  };
}

/**
 * The signed fee ceiling per contract, 18 decimals, at the highest price the order can fill at.
 * From trading-app future-market.ts futureWorstFeeUnits, for a contract sized in cNGN.
 */
function futureWorstFeeUnits(contractSize: number, priceCeiling: number) {
  const microUsdc = BigInt(Math.ceil(contractSize * priceCeiling * FUTURE_WORST_FEE_RATE * 1e6));
  return microUsdc * 10n ** 12n;
}

export type OrderOutcome = {
  status?: string;
  filled_amount?: string;
  remaining_amount?: string;
  cancel_reason?: string;
};

/**
 * Whether the whole order filled. The venue can report the full amount filled while the status
 * still reads "active", for a moment after the match, so the amount decides, not the status.
 */
export function isFullyFilled(outcome: OrderOutcome | null, units: number) {
  return outcome?.status === "filled" || Number(outcome?.filled_amount ?? "0") >= units;
}

/** Done: filled in full, or ended (expired or cancelled). A partial fill may still complete. */
function isFillKnown(outcome: OrderOutcome | null, units: number) {
  return isFullyFilled(outcome, units) || outcome?.status === "expired" || outcome?.status === "cancelled";
}

async function readOrder(orderId: string): Promise<OrderOutcome | null> {
  try {
    const response = await fetch(`/api/venue/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as OrderOutcome) : null;
  } catch {
    return null;
  }
}

export type PlacedOrder = {
  orderId: string;
  /** The last status read; null when the venue had not recorded the order within the poll. */
  outcome: OrderOutcome | null;
  units: number;
};

/** Signs the order with the embedded wallet, sends it to the venue, then waits to see what filled. */
export async function placeOrder({
  market,
  plan,
  subaccountId,
  wallet,
}: {
  market: VenueMarket;
  plan: OrderPlan;
  subaccountId: string;
  wallet: ConnectedWallet;
}): Promise<PlacedOrder> {
  const chain = getAppChain();
  await wallet.switchChain(chain.id);
  const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });

  const isFuture = market.symbol === FUTURE_SYMBOL;
  const envelope = buildSpotOrderEnvelope({
    expiry: Math.floor(Date.now() / 1000) + ORDER_LIFETIME_SECONDS,
    market: {
      amountScale: BigInt(market.amountScale),
      assetAddress: market.assetAddress,
      orderIdPrefix: isFuture ? "future" : "spot",
      subId: market.subId,
      tradeModuleAddress: market.tradeModuleAddress,
      worstFeeUnits:
        isFuture && market.contractSize !== null
          ? futureWorstFeeUnits(market.contractSize, Math.max(Number(plan.limitPrice), market.fillBand?.high ?? 0))
          : undefined,
    },
    side: plan.side,
    subaccountId,
    uiPrice: plan.limitPrice,
    uiSize: String(plan.units),
    walletAddress: wallet.address,
  });

  const signature = await walletClient.signTypedData({
    account: wallet.address as `0x${string}`,
    ...envelope.typedData,
  });

  const response = await fetch("/api/venue/orders", {
    body: JSON.stringify({ ...envelope.payload, signature }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message || body?.error || `The venue refused the order (${response.status})`);
  }

  const orderId = envelope.payload.order_id;
  const deadline = Date.now() + FILL_POLL_TIMEOUT_MS;
  let outcome = await readOrder(orderId);
  while (!isFillKnown(outcome, plan.units) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, FILL_POLL_INTERVAL_MS));
    outcome = await readOrder(orderId);
  }
  return { orderId, outcome, units: plan.units };
}
