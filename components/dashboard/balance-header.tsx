"use client";

import { useMemo, useState } from "react";
import { addMilliseconds, format, startOfYear, subDays, subMonths } from "date-fns";
import { Info } from "lucide-react";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
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

function getRangeLabels(range: Range, accountCreatedAt: string | null) {
  const now = new Date();
  const start = getRangeStart(range, now, accountCreatedAt);
  const step = (now.getTime() - start.getTime()) / (LABEL_COUNT - 1);

  return Array.from({ length: LABEL_COUNT }, (_, index) =>
    index === LABEL_COUNT - 1 ? "Today" : format(addMilliseconds(start, step * index), "MMM d")
  );
}

export function BalanceHeader({ accountCreatedAt = null }: { accountCreatedAt?: string | null }) {
  const [range, setRange] = useState<Range>("1W");
  const labels = useMemo(() => getRangeLabels(range, accountCreatedAt), [range, accountCreatedAt]);

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
              <span className="text-black/40 dark:text-white/50">$</span>0.00
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

        {/* Balance history isn't tracked yet, so the chart holds only its grid and this note. */}
        <div className="relative mt-7 flex h-[199px] items-center justify-center border-y border-b-[#E5DDD3] border-t-[#F2ECE4] dark:border-b-white/15 dark:border-t-white/5">
          <div className="absolute inset-x-0 top-1/3 border-t border-[#F2ECE4] dark:border-white/5" />
          <div className="absolute inset-x-0 top-2/3 border-t border-[#F2ECE4] dark:border-white/5" />
          <p className="relative px-4 text-center text-[13px] text-black/60 dark:text-white/60">
            Your balance history will appear here once you add funds.
          </p>
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
