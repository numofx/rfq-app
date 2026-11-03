"use client";

import { useMemo, useState } from "react";
import { addMilliseconds, format, startOfYear, subDays, subMonths } from "date-fns";
import { Info } from "lucide-react";
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
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[15px] text-[#6F6F6B] dark:text-white/60">
            Available balance
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="mt-2 text-[30px] leading-none text-[#141414] dark:text-white">
            <span className="mr-2 text-[#8A8A86] dark:text-white/50">$</span>0.00
          </p>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Chart range">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => setRange(option)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[14px] transition-colors",
                range === option
                  ? "bg-[#F5F5F3] text-[#141414] dark:bg-white/10 dark:text-white"
                  : "text-[#6F6F6B] hover:text-[#141414] dark:text-white/60 dark:hover:text-white"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Balance history isn't tracked yet, so the chart shows the current flat $0.00 balance. */}
      <div
        className="relative mt-8 h-[220px] text-[#D6D6D2] dark:text-white/15"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
        role="img"
        aria-label="Balance chart: $0.00 across the selected range"
      >
        {/* The line runs to the panel's left edge, which main clips. */}
        <div className="absolute bottom-7 right-0 h-0.5 w-[100vw] bg-[#3A3A38] dark:bg-white/70" />
      </div>

      <div className="mt-4 flex justify-between text-[13px] text-[#6F6F6B] dark:text-white/60">
        {labels.map((label, index) => (
          <span key={index} suppressHydrationWarning className={cn(index % 2 === 1 && "hidden sm:inline")}>
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
