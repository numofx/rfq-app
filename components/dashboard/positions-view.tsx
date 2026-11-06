"use client";

import { useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, OctagonAlert } from "lucide-react";
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

/** The buffer share below which the account reads At risk; the bar marks it. */
const AT_RISK_SHARE = 0.2;

const HEALTH: Record<HealthLevel, { label: string; icon: ElementType; text: string; badge: string; bar: string }> = {
  healthy: {
    label: "Healthy",
    icon: Check,
    text: "text-[#4A7043] dark:text-[#8CC584]",
    badge: "bg-[#E3E6DA] text-[#4A7043] dark:bg-[#8CC584]/15 dark:text-[#8CC584]",
    bar: "bg-[#4A7043] dark:bg-[#8CC584]",
  },
  watch: {
    label: "Watch",
    icon: AlertTriangle,
    text: "text-[#8A5A00] dark:text-[#E8B95A]",
    badge: "bg-[#F1E4C8] text-[#8A5A00] dark:bg-[#E8B95A]/15 dark:text-[#E8B95A]",
    bar: "bg-[#C98A12] dark:bg-[#E0A93E]",
  },
  "at-risk": {
    label: "At risk",
    icon: OctagonAlert,
    text: "text-[#B4412F] dark:text-[#E98A7A]",
    badge: "bg-[#F3D9D2] text-[#B4412F] dark:bg-[#E98A7A]/15 dark:text-[#E98A7A]",
    bar: "bg-[#B4412F] dark:bg-[#E98A7A]",
  },
};

const MUTED = "text-black/55 dark:text-white/60";
const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-[#EFE7DC] px-5 text-[15px] font-medium text-[#141414] outline-none transition-colors hover:bg-[#E4DACC] focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15";
const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-[#141414] px-5 text-[15px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#141414] dark:hover:bg-white/90";

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-baseline gap-2.5 text-[20px] font-semibold tracking-[-0.03em] text-[#141414] dark:text-white">
        {title}
        {count ? <span className={cn("text-[14px] font-normal tracking-normal", MUTED)}>{count}</span> : null}
      </h2>
      <div className={`mt-4 ${PANEL_TRAY}`}>
        <div className={cn(PANEL_CARD, "overflow-hidden")}>{children}</div>
      </div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className={cn("px-6 py-10 text-center text-[14px]", MUTED)}>{children}</div>;
}

function HealthCard({ health }: { health: CollateralHealth }) {
  const level = HEALTH[health.level];
  const Icon = level.icon;
  const percent = Math.round(health.bufferShare * 100);
  return (
    <>
      <div className="px-5 pb-7 pt-6 sm:px-9 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className={cn("flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full", level.badge)}>
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <p className={cn("text-[30px] font-semibold tracking-[-0.04em]", level.text)}>{level.label}</p>
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

        <div className="mt-8 flex items-baseline justify-between gap-4 text-[14px]">
          <p className="text-[#141414] dark:text-white">Liquidation buffer</p>
          <p className="font-mono text-[13px] text-[#141414] dark:text-white">
            {usd(health.bufferUsd)} <span className={MUTED}>·</span> {percent}%
          </p>
        </div>
        <div
          role="meter"
          aria-label="Liquidation buffer"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% of equity above liquidation, ${level.label}`}
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10"
        >
          <div className={cn("h-full rounded-full", level.bar)} style={{ width: `${Math.max(percent, 2)}%` }} />
        </div>
        {/* Where the bar reaches liquidation and the At risk line, so the fill reads against them. */}
        <div className="relative mt-2 h-8 text-[12px]" aria-hidden="true">
          <span className="absolute left-0 top-0 flex flex-col items-start text-[#B4412F] dark:text-[#E98A7A]">
            <span className="h-2 w-px bg-current" />
            <span className="mt-1">Liquidation</span>
          </span>
          <span
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center text-[#8A5A00] dark:text-[#E8B95A]"
            style={{ left: `${AT_RISK_SHARE * 100}%` }}
          >
            <span className="h-2 w-px bg-current" />
            <span className="mt-1">At risk</span>
          </span>
          <span className={cn("absolute right-0 top-0 flex flex-col items-end", MUTED)}>
            <span className="h-2 w-px" />
            <span className="mt-1">Your equity</span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 border-t border-black/[0.07] dark:border-white/10 sm:grid-cols-3">
        {[
          { label: "Equity", value: usd(health.equityUsd), hint: "Collateral plus futures value" },
          { label: "Margin in use", value: usd(health.marginInUseUsd) },
          { label: "Available", value: usd(health.availableUsd) },
        ].map(({ label, value, hint }, index) => (
          <div
            key={label}
            className={cn(
              "px-5 py-5 sm:px-9 sm:py-6",
              index > 0 && "border-t border-black/[0.07] dark:border-white/10 sm:border-l sm:border-t-0"
            )}
          >
            <dt className="text-[14px] text-[#141414] dark:text-white">{label}</dt>
            <dd className="mt-1.5 font-mono text-[20px] font-semibold text-[#141414] dark:text-white">{value}</dd>
            {hint ? <dd className={cn("mt-1.5 text-[13px]", MUTED)}>{hint}</dd> : null}
          </div>
        ))}
      </dl>
    </>
  );
}

const COLUMNS = "sm:grid sm:grid-cols-[1.6fr_1fr_1fr_1.2fr_1.2fr_140px] sm:items-start sm:gap-6";

function FuturesHeader() {
  return (
    <div className={cn("hidden border-b border-black/[0.07] px-7 py-4 text-[13px] dark:border-white/10", COLUMNS, MUTED)}>
      <span>Position</span>
      <span>Notional</span>
      <span>Mark rate</span>
      <span>Est. liquidation rate</span>
      <span>Unsettled P&amp;L</span>
      <span />
    </div>
  );
}

/** One table cell; on a phone, where there is no header row, it carries its own label. */
function Cell({ label, value, hint, muted }: { label: string; value: string; hint?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:block">
      <span className={cn("text-[13px] sm:hidden", MUTED)}>{label}</span>
      <span className="text-right sm:text-left">
        <span className={cn("block font-mono text-[16px] font-semibold", muted ? "text-black/45 dark:text-white/45" : "text-[#141414] dark:text-white")}>
          {value}
        </span>
        {hint ? <span className={cn("mt-1 block text-[13px] leading-snug", MUTED)}>{hint}</span> : null}
      </span>
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
  const closeProblem =
    position.market !== FUTURE_SYMBOL ? "Close this on app.numofx.com" : plan === null ? "Loading the market" : typeof plan === "string" ? plan : null;
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
    <li className="px-5 py-6 sm:px-7">
      <div className={cn("space-y-3 sm:space-y-0", COLUMNS)}>
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 font-mono text-[16px] font-semibold text-[#141414] dark:text-white">
            {ngn(position.cngn)}
            <span
              className={cn(
                "rounded-[5px] px-2 py-1 font-sans text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#141414]",
                isLong ? "bg-[#A9D4F0]" : "bg-[#F0D2A9]"
              )}
            >
              {isLong ? "Long" : "Short"}
            </span>
          </p>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            {position.market}
            {position.status !== "trading" ? ` · ${position.status}` : ""}
          </p>
        </div>
        <Cell label="Notional" value={usd(position.notionalUsdc)} />
        <Cell label="Mark rate" value={rate(position.markPrice)} hint="cNGN per USDC" />
        <Cell
          label="Est. liquidation rate"
          value={liquidation === null ? "—" : rate(liquidation)}
          hint={liquidation === null ? "No liquidation risk at this size" : "cNGN per USDC"}
          muted={liquidation === null}
        />
        <Cell label="Unsettled P&L" value={usd(position.pendingVmUsdc)} hint="Settles at the next mark" muted={position.pendingVmUsdc === 0} />
        <div className="pt-1 sm:pt-0">
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setIsConfirming(true);
            }}
            disabled={isConfirming || closeProblem !== null || !canTrade(session)}
            className={cn(SECONDARY_BUTTON, "w-full sm:w-auto")}
          >
            Close position
          </button>
        </div>
      </div>

      {isConfirming && plan && typeof plan !== "string" ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F3EFE9] px-5 py-4 dark:bg-white/5">
          <p className="text-[14px] text-[#141414] dark:text-white">
            Close {ngn(position.cngn)} at about {rate(plan.expectedPrice)} cNGN per USDC.{" "}
            <span className={MUTED}>Fee {usd(plan.feeUsdc)}.</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsConfirming(false)} disabled={isClosing} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" onClick={() => void close()} disabled={isClosing} className={PRIMARY_BUTTON}>
              {isClosing ? "Closing" : "Confirm close"}
            </button>
          </div>
        </div>
      ) : null}

      {message || (closeProblem && closeProblem !== "Loading the market") ? (
        <p
          aria-live="polite"
          className={cn("mt-3 text-[13px] sm:text-right", message?.tone === "error" ? "text-[#B4412F] dark:text-[#E98A7A]" : MUTED)}
        >
          {message?.text ?? closeProblem}
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

  let note: ReactNode = null;
  if (holdings === "none") {
    note = (
      <>
        You don&apos;t have a trading account yet.{" "}
        <Link href="/dashboard?action=deposit" className="font-medium text-[#141414] underline underline-offset-2 dark:text-white">
          Add funds
        </Link>{" "}
        to open one.
      </>
    );
  } else if (session !== null && session.isReady && !session.isAuthenticated) {
    note = "Open Add funds and verify your email to see your positions.";
  } else if (holdings === null || isLoading) {
    note = "Loading your positions";
  } else if (isError || positions === null) {
    note = "Your positions couldn't be loaded. Try again shortly.";
  }

  if (note !== null || positions === null) {
    return (
      <Section title="Collateral health">
        <Note>{note}</Note>
      </Section>
    );
  }

  const count = positions.futures.length;
  return (
    <>
      <Section title="Collateral health">
        {health ? <HealthCard health={health} /> : <Note>Margin figures aren&apos;t available right now.</Note>}
      </Section>
      <Section title="Futures" count={`${count} open`}>
        {count === 0 ? (
          <Note>
            No open positions.{" "}
            <Link href="/dashboard?action=lock-rate" className="font-medium text-[#141414] underline underline-offset-2 dark:text-white">
              Lock a rate
            </Link>{" "}
            to open one.
          </Note>
        ) : (
          <>
            <FuturesHeader />
            <ul className="divide-y divide-black/[0.07] dark:divide-white/10">
              {positions.futures.map((position) => (
                <PositionRow key={position.market} position={position} health={health} session={session as TradeSession} />
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

/** The account's futures positions and the margin behind them. */
export function PositionsView() {
  return <WithTradeSession>{(session) => <Positions session={session} />}</WithTradeSession>;
}
