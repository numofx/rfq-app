"use client";

import { useMemo, useState } from "react";
import { addMilliseconds, format, startOfYear, subDays, subMonths } from "date-fns";
import { Info } from "lucide-react";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
import { accountHoldings, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { useBalanceHistory, useVenueMarket } from "@/lib/hooks/useTrading";
import { SPOT_SYMBOL } from "@/lib/venue/market";
import { cn } from "@/lib/utils";

const RANGES = ["1W", "1M", "3M", "YTD", "All"] as const;
type Range = (typeof RANGES)[number];

const LABEL_COUNT = 7;

function getRangeStart(range: Range, now: Date, accountCreatedAt: string | null) {
  const minimumStart = subDays(now, LABEL_COUNT - 1);
  const starts: Record<Range, Date> = {
    "1W": minimumStart,
    "1M": subMonths(now, 1),
    "3M": subMonths(now, 3),
    YTD: startOfYear(now),
    All: accountCreatedAt ? new Date(accountCreatedAt) : startOfYear(now),
  };
  return new Date(Math.min(starts[range].getTime(), minimumStart.getTime()));
}

function getRangeLabels(start: Date, now: Date) {
  const step = (now.getTime() - start.getTime()) / (LABEL_COUNT - 1);

  return Array.from({ length: LABEL_COUNT }, (_, index) =>
    index === LABEL_COUNT - 1 ? "Today" : format(addMilliseconds(start, step * index), "MMM d")
  );
}

/** The trading account's USDC plus its cNGN at the spot mid, or a dash while either is unknown. */
function TotalBalance({ session }: { session: TradeSession | null }) {
  const { market } = useVenueMarket(SPOT_SYMBOL);
  const holdings = accountHoldings(session);
  const bid = market?.bids[0]?.price;
  const ask = market?.asks[0]?.price;
  const mid = bid && ask ? (bid + ask) / 2 : null;

  let total: string = "—";
  if (holdings === "none") total = "0.00";
  else if (holdings && (holdings.cngn === 0 || mid !== null)) {
    const usd = holdings.usdc + holdings.cngn * (mid ?? 0);
    total = usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return <>{total}</>;
}

const CHART_POINTS = 48;
const CHART_HEADROOM = 1.15;

const formatUsd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ChartNote({ children }: { children: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="px-4 text-center text-[13px] text-black/60 dark:text-white/60">{children}</p>
    </div>
  );
}

/**
 * The trading account's value over the range, read from the ledger at each point. cNGN is valued
 * at today's spot mid, so the line shows deposits, trades and fills rather than the rate moving.
 * Drawn as steps: a balance holds until something changes it.
 */
function BalanceChart({ session, rangeKey, startMs }: { session: TradeSession | null; rangeKey: string; startMs: number }) {
  const holdings = accountHoldings(session);
  const subaccountId = holdings !== null && holdings !== "none" ? session?.subaccountId ?? null : null;
  const { history, isLoading } = useBalanceHistory(subaccountId, rangeKey, startMs, CHART_POINTS);
  const { market } = useVenueMarket(SPOT_SYMBOL);
  const [hovered, setHovered] = useState<number | null>(null);

  const bid = market?.bids[0]?.price;
  const ask = market?.asks[0]?.price;
  const mid = bid && ask ? (bid + ask) / 2 : 0;
  const values = history?.map((point) => point.usdc + point.cngn * mid) ?? [];
  const max = Math.max(0, ...values);

  if (holdings === "none") return <ChartNote>Your balance history will appear here once you add funds.</ChartNote>;
  if (session !== null && session.isReady && !session.isAuthenticated) {
    return <ChartNote>Open Add funds and verify your email to see your balance history.</ChartNote>;
  }
  if (holdings === null || isLoading) return <ChartNote>Loading your balance history</ChartNote>;
  if (!history || values.length < 2) return <ChartNote>Your balance history couldn&apos;t be loaded.</ChartNote>;
  if (max === 0) return <ChartNote>No balance in this period.</ChartNote>;

  const top = max * CHART_HEADROOM;
  const x = (index: number) => (index / (values.length - 1)) * 1000;
  const y = (value: number) => 199 - (value / top) * 199;
  let line = `M ${x(0)} ${y(values[0])}`;
  for (let index = 1; index < values.length; index += 1) {
    line += ` H ${x(index)} V ${y(values[index])}`;
  }
  const area = `${line} V 199 H 0 Z`;
  const hoveredValue = hovered === null ? null : values[hovered];
  const hoveredLeft = hovered === null ? 0 : (hovered / (values.length - 1)) * 100;

  return (
    <div
      className="absolute inset-0"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        setHovered(Math.round(fraction * (values.length - 1)));
      }}
      onPointerLeave={() => setHovered(null)}
    >
      <svg viewBox="0 0 1000 199" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <path d={area} className="fill-[#141414]/[0.05] dark:fill-white/[0.06]" />
        <path d={line} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-[#141414] dark:stroke-white" />
      </svg>

      {hovered !== null && hoveredValue !== null ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 border-l border-black/20 dark:border-white/25" style={{ left: `${hoveredLeft}%` }} />
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#141414] ring-2 ring-[#FDFBF7] dark:bg-white dark:ring-[#1A1A1A]"
            style={{ left: `${hoveredLeft}%`, top: `${(y(hoveredValue) / 199) * 100}%` }}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:bg-[#242424]",
              hoveredLeft > 60 ? "-translate-x-[calc(100%+10px)]" : "translate-x-[10px]"
            )}
            style={{ left: `${hoveredLeft}%` }}
          >
            <p className="text-black/60 dark:text-white/60">{format(history[hovered].time, "MMM d, h:mm a")}</p>
            <p className="mt-0.5 font-mono text-[14px] font-semibold text-[#141414] dark:text-white">{formatUsd(hoveredValue)}</p>
          </div>
        </>
      ) : null}

      <table className="sr-only">
        <caption>Account value over the selected range</caption>
        <tbody>
          {history.map((point, index) => (
            <tr key={point.time}>
              <th scope="row">{format(point.time, "MMM d, h:mm a")}</th>
              <td>{formatUsd(values[index])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BalanceHeader({ accountCreatedAt = null }: { accountCreatedAt?: string | null }) {
  const [range, setRange] = useState<Range>("1W");
  // Fixed when the range changes, so the chart's query and the axis labels share one window.
  const { start, now } = useMemo(() => {
    const current = new Date();
    return { start: getRangeStart(range, current, accountCreatedAt), now: current };
  }, [range, accountCreatedAt]);
  const labels = useMemo(() => getRangeLabels(start, now), [start, now]);

  return (
    <section className={PANEL_TRAY}>
      <div className={`${PANEL_CARD} p-5 sm:px-9 sm:pb-7 sm:pt-8`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] text-black/55 dark:text-white/60">
              Available balance
              <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-[#141414] dark:text-white sm:text-[52px]">
              <span className="text-black/40 dark:text-white/50">$</span>
              <WithTradeSession>{(session) => <TotalBalance session={session} />}</WithTradeSession>
            </p>
          </div>

          <div
            className="flex items-center rounded-full bg-[#F6F0E9] p-1 dark:bg-white/5"
            role="group"
            aria-label="Chart range"
          >
            {RANGES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                onClick={() => setRange(option)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-3.5",
                  range === option
                    ? "bg-[#EDE5DA] text-[#141414] dark:bg-white/10 dark:text-white"
                    : "text-black/55 hover:text-[#141414] dark:text-white/60 dark:hover:text-white"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-7 h-[199px] border-y border-b-[#E5DDD3] border-t-[#F2ECE4] dark:border-b-white/15 dark:border-t-white/5">
          <div className="absolute inset-x-0 top-1/3 border-t border-[#F2ECE4] dark:border-white/5" />
          <div className="absolute inset-x-0 top-2/3 border-t border-[#F2ECE4] dark:border-white/5" />
          <WithTradeSession>
            {(session) => <BalanceChart session={session} rangeKey={range} startMs={start.getTime()} />}
          </WithTradeSession>
        </div>

        <div className="mt-3 flex justify-between font-mono text-[12px] text-black/55 dark:text-white/60">
          {labels.map((label, index) => (
            <span key={index} suppressHydrationWarning className={cn(index % 2 === 1 && "hidden sm:inline")}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
