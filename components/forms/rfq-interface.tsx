"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LOCKED_RATE = 1592.75;

const NGN_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function RFQInterface() {
  const [lockUntil, setLockUntil] = useState<"june" | "december">("june");
  const [usdAmountInput, setUsdAmountInput] = useState("50000");

  const usdAmount = Number(usdAmountInput.replace(/,/g, "").trim()) || 0;
  const totalNaira = usdAmount * LOCKED_RATE;

  return (
    <section className="w-full max-w-[48rem] rounded-xl border border-black/5 bg-slate-800 p-6 shadow-xl md:p-8 mx-auto text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-black/5 border-b pb-6">
        <div className="flex items-center gap-4">
          <div className="-space-x-3 flex">
            <div className="relative z-10 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm">
              <Image
                alt="US Flag"
                className="h-full w-full object-cover"
                height={36}
                src="/assets/us-flag.svg"
                width={36}
              />
            </div>
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm">
              <Image
                alt="Nigeria Flag"
                className="h-full w-full object-cover"
                height={36}
                src="/assets/ng-flag.svg"
                width={36}
              />
            </div>
          </div>
          <span className="font-bold text-white text-lg">USD / NGN</span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-transparent pr-2 font-semibold text-white text-[0.95rem]">
          <span className="h-2 w-2 rounded-full bg-[#2EAE6A]" />
          <span>Spot {NGN_FORMATTER.format(LOCKED_RATE)}</span>
        </div>
      </div>

      <div className="space-y-8 pt-8">
        {/* Split Section: Amount & Lock Until */}
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Left Column: Your Amount */}
          <div className="flex-1 space-y-3">
            <label
              className="font-bold text-[#9CA3AF] text-[0.8rem] uppercase tracking-wider block"
              htmlFor="amount-input"
            >
              Your Amount
            </label>
            <div className="flex items-center pb-2">
              <span className="mr-2 font-semibold text-[#8B989A] text-[1.75rem] leading-none md:text-[2.25rem]">$</span>
              <input
                className="w-full min-w-0 bg-transparent font-bold text-white text-[2.25rem] leading-none outline-none placeholder:text-[#8B989A] md:text-[2.75rem]"
                id="amount-input"
                inputMode="decimal"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9,.]/g, "");
                  setUsdAmountInput(val);
                }}
                placeholder="0"
                type="text"
                value={usdAmountInput}
              />
              <span className="ml-2 font-bold text-[#8B989A] text-lg">USD</span>
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="hidden w-px bg-black/5 md:block" />
          <div className="h-px w-full bg-black/5 md:hidden" />

          {/* Right Column: Lock Until */}
          <div className="flex-1 space-y-4">
            <div className="font-bold text-[#9CA3AF] text-[0.8rem] uppercase tracking-wider block">
              Lock Until
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                className={cn(
                  "h-[4rem] rounded-2xl font-bold text-[1.05rem] transition-colors",
                  lockUntil === "june"
                    ? "bg-black text-white"
                    : "border border-black/5 bg-[#FAF5F0] text-black hover:bg-[#F3EFEA]"
                )}
                onClick={() => setLockUntil("june")}
                type="button"
              >
                Jun 30, 2026
              </button>
              <button
                className={cn(
                  "h-[4rem] rounded-2xl font-bold text-[1.05rem] transition-colors",
                  lockUntil === "december"
                    ? "bg-black text-white"
                    : "border border-black/5 bg-[#FAF5F0] text-black hover:bg-[#F3EFEA]"
                )}
                onClick={() => setLockUntil("december")}
                type="button"
              >
                Dec 31, 2026
              </button>
            </div>
          </div>
        </div>

        {/* Locked Rate Summary */}
        <div className="flex items-center justify-between rounded-2xl bg-[#F6F4F0] p-5 md:p-6">
          <div>
            <div className="font-bold text-[1.05rem] text-black md:text-[1.15rem]">Locked rate</div>
            <div className="mt-1 text-[0.95rem] text-black/60">
              Settles on {lockUntil === "june" ? "Jun 30, 2026" : "Dec 31, 2026"}
            </div>
          </div>
          <div className="font-bold text-[1.8rem] text-black md:text-[2.2rem]">
            <span className="mr-1 text-[1.5rem] md:text-[1.8rem]">₦</span>
            {NGN_FORMATTER.format(LOCKED_RATE)}
          </div>
        </div>

        {/* Action Button & Disclaimer */}
        <div className="space-y-5">
          <button
            className="flex h-[4rem] w-full items-center justify-center gap-3 rounded-[20px] bg-black font-semibold text-[1.1rem] text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 md:h-[4.5rem] md:text-[1.25rem]"
            disabled={usdAmount <= 0}
            onClick={() => {
              // Authentication check logic can be added here
            }}
            type="button"
          >
            <span>Lock ₦{NGN_FORMATTER.format(totalNaira)}</span>
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
