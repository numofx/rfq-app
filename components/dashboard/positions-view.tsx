"use client";

import { useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
import { accountHoldings, canTrade, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { usePositions, useVenueMarket } from "@/lib/hooks/useTrading";
import { FUTURE_SYMBOL } from "@/lib/venue/market";
import { isFullyFilled, placeOrder, planClose } from "@/lib/venue/place-order";
import {
  collateralHealth,
  liquidationPrice,
  type CollateralHealth,
  type FuturePosition,
  type HealthLevel,
} from "@/lib/venue/positions";
import { cn } from "@/lib/utils";

const usd = (value: number) =>
  `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ngn = (value: number) => `₦${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
/** Rates read as cNGN per USDC across command, the inverse of the venue's USDC per cNGN. */
const rate = (usdcPerCngn: number) => (1 / usdcPerCngn).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const HEALTH: Record<HealthLevel, { label: string; icon: ElementType; text: string; bar: string; note: string }> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    text: "text-[#2F6B45] dark:text-[#7CC79A]",
    bar: "bg-[#3F8A5A] dark:bg-[#6DBB8B]",
    note: "Plenty of room before any position could be liquidated.",
  },
  watch: {
    label: "Watch",
    icon: AlertTriangle,
    text: "text-[#8A5A00] dark:text-[#E8B95A]",
    bar: "bg-[#C98A12] dark:bg-[#E0A93E]",
    note: "Your buffer is thinning. Add collateral or reduce a position to stay clear of liquidation.",
  },
  "at-risk": {
    label: "At risk",
    icon: OctagonAlert,
    text: "text-[#B4412F] dark:text-[#E98A7A]",
    bar: "bg-[#C2492F] dark:bg-[#E2755F]",
    note: "Close to liquidation. Add collateral or close a position now.",
  },
};

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-full bg-[#EFE7DC] px-4 text-[14px] font-medium text-[#141414] outline-none transition-colors hover:bg-[#E4DACC] focus-visible:ring-2 focus-visible:ring-black/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-full bg-[#141414] px-4 text-[14px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#141414] dark:hover:bg-white/90";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">{title}</h2>
      <div className={`mt-4 ${PANEL_TRAY}`}>
        <div className={PANEL_CARD}>{children}</div>
      </div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="px-6 py-10 text-center text-[14px] text-black/55 dark:text-white/60">{children}</div>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-black/55 dark:text-white/60">{label}</dt>
      <dd className="mt-1 font-mono text-[18px] font-semibold text-[#141414] dark:text-white">{value}</dd>
      {hint ? <dd className="mt-0.5 text-[12px] text-black/50 dark:text-white/50">{hint}</dd> : null}
    </div>
  );
}

function HealthCard({ health }: { health: CollateralHealth }) {
  const level = HEALTH[health.level];
  const Icon = level.icon;
  const percent = Math.round(health.bufferShare * 100);
  return (
    <div className="px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Icon className={cn("h-5 w-5", level.text)} strokeWidth={2} aria-hidden="true" />
          <p className={cn("text-[17px] font-semibold", level.text)}>{level.label}</p>
          <p className="font-mono text-[14px] text-black/55 dark:text-white/60">{percent}% buffer</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard?action=deposit" className={PRIMARY_BUTTON}>
            Add collateral
          </Link>
          <Link href="/dashboard?action=withdraw" className={SECONDARY_BUTTON}>
            Withdraw
          </Link>
        </div>
      </div>

      <div
        role="meter"
        aria-label="Margin buffer"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% of equity before liquidation, ${level.label}`}
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10"
      >
        <div className={cn("h-full rounded-full", level.bar)} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <p className="mt-2 text-[13px] text-black/60 dark:text-white/60">{level.note}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Equity" value={usd(health.equityUsd)} hint="Collateral plus futures value" />
        <Stat label="Margin in use" value={usd(health.marginInUseUsd)} hint="25% of open notional" />
        <Stat label="Available" value={usd(health.availableUsd)} hint="To withdraw or trade" />
        <Stat label="Liquidation buffer" value={usd(health.bufferUsd)} hint="Equity above 15% maintenance" />
      </dl>
    </div>
  );
}

function PositionRow({ position, health, session }: { position: FuturePosition; health: CollateralHealth | null; session: TradeSession }) {
  const queryClient = useQueryClient();
  const { market } = useVenueMarket(FUTURE_SYMBOL);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [message, setMessage] = useState<{ tone: "neutral" | "error"; text: string } | null>(null);

  const liquidation = health ? liquidationPrice(position, health) : null;
  const plan = market && position.market === FUTURE_SYMBOL ? planClose(market, position.side, position.cngn) : null;
  const closeProblem = position.market !== FUTURE_SYMBOL ? "Close this on app.numofx.com" : plan === null ? "Loading the market" : typeof plan === "string" ? plan : null;
  const isLong = position.side === "long";

  async function close() {
    if (!canTrade(session) || !market || !plan || typeof plan === "string") return;
    setIsClosing(true);
    setMessage(null);
    try {
      const order = await placeOrder({ market, plan, subaccountId: session.subaccountId, wallet: session.wallet });
      const filled = Number(order.outcome?.filled_amount ?? "0") * market.unitCngn;
      if (isFullyFilled(order.outcome, order.units)) setMessage({ tone: "neutral", text: "Closed." });
      else if (filled > 0) setMessage({ tone: "neutral", text: `Closed ${ngn(filled)}. The rest lapses in 2 minutes if it doesn't fill.` });
      else setMessage({ tone: "error", text: "The close didn't fill. Nothing changed. Try again." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "The close could not be placed." });
    } finally {
      setIsClosing(false);
      setIsConfirming(false);
      session.refreshBalances();
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  }

  return (
    <li className="px-5 py-5 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[16px] font-semibold text-[#141414] dark:text-white">
            {ngn(position.cngn)}
            <span
              className={cn(
                "rounded-[5px] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]",
                isLong ? "bg-[#A9D4F0] text-[#141414]" : "bg-[#F0D2A9] text-[#141414]"
              )}
            >
              {isLong ? "Long" : "Short"}
            </span>
          </p>
          <p className="mt-0.5 text-[13px] text-black/55 dark:text-white/60">
            {position.market}
            {position.expiresAt ? ` · settles ${format(position.expiresAt * 1000, "MMM d, yyyy")}` : ""}
            {position.status !== "trading" ? ` · ${position.status}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isConfirming ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsConfirming(false)} disabled={isClosing} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              <button type="button" onClick={() => void close()} disabled={isClosing} className={PRIMARY_BUTTON}>
                {isClosing ? "Closing" : `Confirm close ${ngn(position.cngn)}`}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setIsConfirming(true);
              }}
              disabled={closeProblem !== null || !canTrade(session)}
              className={cn(SECONDARY_BUTTON, "disabled:cursor-not-allowed disabled:opacity-50")}
            >
              Close position
            </button>
          )}
          {isConfirming && plan && typeof plan !== "string" ? (
            <p className="text-[12px] text-black/55 dark:text-white/60">
              At about {rate(plan.expectedPrice)} cNGN per USDC, fee {usd(plan.feeUsdc)}
            </p>
          ) : closeProblem && closeProblem !== "Loading the market" ? (
            <p className="text-[12px] text-black/55 dark:text-white/60">{closeProblem}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="Notional" value={usd(position.notionalUsdc)} />
        <Stat label="Mark rate" value={rate(position.markPrice)} hint="cNGN per USDC" />
        <Stat label="Est. liquidation rate" value={liquidation === null ? "None" : rate(liquidation)} hint="cNGN per USDC" />
        <Stat label="Unsettled P&L" value={usd(position.pendingVmUsdc)} hint="Settles at the next mark" />
      </dl>

      {message ? (
        <p aria-live="polite" className={cn("mt-3 text-[13px]", message.tone === "error" ? "text-[#B4412F] dark:text-[#E98A7A]" : "text-black/60 dark:text-white/60")}>
          {message.text}
        </p>
      ) : null}
    </li>
  );
}

function Positions({ session }: { session: TradeSession | null }) {
  const holdings = accountHoldings(session);
  const subaccountId = holdings !== null && holdings !== "none" ? (session?.subaccountId ?? null) : null;
  const { positions, isLoading, isError } = usePositions(subaccountId);
  const health = positions ? collateralHealth(positions) : null;

  let body: ReactNode;
  if (holdings === "none") {
    body = (
      <Section title="Collateral health">
        <Note>
          You don&apos;t have a trading account yet.{" "}
          <Link href="/dashboard?action=deposit" className="font-medium text-[#141414] underline underline-offset-2 dark:text-white">
            Add funds
          </Link>{" "}
          to open one.
        </Note>
      </Section>
    );
  } else if (session !== null && session.isReady && !session.isAuthenticated) {
    body = (
      <Section title="Collateral health">
        <Note>Open Add funds and verify your email to see your positions.</Note>
      </Section>
    );
  } else if (holdings === null || isLoading) {
    body = (
      <Section title="Collateral health">
        <Note>Loading your positions</Note>
      </Section>
    );
  } else if (isError || positions === null) {
    body = (
      <Section title="Collateral health">
        <Note>Your positions couldn&apos;t be loaded. Try again shortly.</Note>
      </Section>
    );
  } else {
    body = (
      <>
        <Section title="Collateral health">
          {health ? <HealthCard health={health} /> : <Note>Margin figures aren&apos;t available right now.</Note>}
        </Section>
        <Section title="Futures">
          {positions.futures.length === 0 ? (
            <Note>
              No open positions.{" "}
              <Link href="/dashboard?action=lock-rate" className="font-medium text-[#141414] underline underline-offset-2 dark:text-white">
                Lock a rate
              </Link>{" "}
              to open one.
            </Note>
          ) : (
            <ul className="divide-y divide-black/[0.06] dark:divide-white/10">
              {positions.futures.map((position) => (
                <PositionRow key={position.market} position={position} health={health} session={session as TradeSession} />
              ))}
            </ul>
          )}
        </Section>
        <p className="mt-4 text-[12px] text-black/50 dark:text-white/50">
          Gains and losses settle into your USDC balance at each mark. The liquidation rate is an estimate that holds the rest of your account fixed.
        </p>
      </>
    );
  }

  return <>{body}</>;
}

/** The account's futures positions and the margin behind them. */
export function PositionsView() {
  return <WithTradeSession>{(session) => <Positions session={session} />}</WithTradeSession>;
}
