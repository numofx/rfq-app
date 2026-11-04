"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Image from "next/image";
import { ArrowRight, Calendar, ChevronDown, X } from "lucide-react";
import { ACCOUNTS } from "@/components/dashboard/account-cards";
import { INITIAL_MARGIN_RATE, quoteForward, type ForwardQuote } from "@/lib/forward-quote";
import { useForwardBook } from "@/lib/hooks/useForwardRate";
import { cn } from "@/lib/utils";

const UNTIL_DATES = [
  "Nov 30, 2026",
  "Dec 31, 2026",
  "Jan 31, 2027",
  "Feb 28, 2027",
  "Mar 31, 2027",
  "Apr 30, 2027",
  "May 31, 2027",
];
// The only date with a listed book: cNGN-30NOV26.
const QUOTED_UNTIL = UNTIL_DATES[0];
// No flow behind these yet.
const SOON_ACTIONS = ["Exchange", "Direct", "Request", "Deposit", "Withdraw", "Transfer"];

const MENU_ITEM =
  "flex h-[42px] items-center justify-between rounded-lg px-3 text-[15px] text-[#141414] outline-none dark:text-white";
const MENU_CONTENT =
  "z-50 rounded-2xl bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:bg-[#1A1A1A]";
const LARGE_FIGURE = "font-mono text-[48px] font-semibold leading-none tracking-[-0.02em]";
const FIGURE_CAPTION = "mt-2 h-5 text-center text-[13px]";
const FIELD_LABEL ="block pl-1 text-[14px] font-medium text-[#141414] dark:text-white";
const FIELD_PILL =
  "mt-2 flex h-12 w-full items-center gap-3 rounded-full bg-[#EFE7DC] px-[18px] outline-none focus-within:ring-2 focus-within:ring-black/15 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:focus-within:ring-white/20 dark:focus-visible:ring-white/20";
const FIELD_CHEVRON = "ml-auto h-4 w-4 shrink-0 text-black/60 dark:text-white/60";
const AVAILABLE = "font-mono text-[13px] text-black/60 dark:text-white/60";

const formatNumber = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSigned = (value: number) => `${value < 0 ? "−" : "+"}${formatNumber(Math.abs(value))}`;

const formatPercent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-black/60 dark:text-white/60">{label}</dt>
      <dd className="text-right font-mono text-[#141414] dark:text-white">{value}</dd>
    </div>
  );
}

/** How the rate above is made up, then what locking the entered amount comes to. */
function RateBreakdown({ quote, currency }: { quote: ForwardQuote; currency: string }) {
  const { annualizedPremium, daysToExpiry, feePoints, feeRate, points, position, spot } = quote;
  const premium = annualizedPremium === null ? "" : ` (${annualizedPremium < 0 ? "−" : "+"}${formatPercent(Math.abs(annualizedPremium))} a year)`;

  return (
    <dl className="mt-4 space-y-1.5 rounded-2xl border border-black/10 px-4 py-3 text-[13px] dark:border-white/10">
      <BreakdownRow label="Spot rate" value={formatNumber(spot)} />
      <BreakdownRow label="Forward points" value={`${formatSigned(points)}${premium}`} />
      <BreakdownRow
        label={`Fee (${formatPercent(feeRate)})`}
        value={`${formatSigned(feePoints)}${position ? ` ($${formatNumber(position.feeUsdc)})` : ""}`}
      />
      {position ? (
        <>
          <BreakdownRow
            label="You lock"
            value={currency === "USDC" ? `₦${formatNumber(position.locked)}` : `$${formatNumber(position.locked)}`}
          />
          <BreakdownRow
            label={`Margin required (${INITIAL_MARGIN_RATE * 100}%)`}
            value={`$${formatNumber(position.marginUsdc)}`}
          />
        </>
      ) : null}
      <BreakdownRow label="Settles" value={`In ${daysToExpiry} ${daysToExpiry === 1 ? "day" : "days"}, cash in USDC`} />
    </dl>
  );
}

/** Mounted only while the dialog is open, so closing it clears the form. */
function LockRateForm() {
  const [amount, setAmount] = useState("");
  const [accountCode, setAccountCode] = useState(ACCOUNTS[0].currency);
  const [until, setUntil] = useState(UNTIL_DATES[0]);
  const account = ACCOUNTS.find(({ currency }) => currency === accountCode) ?? ACCOUNTS[0];
  const { book, isPending: isRatePending } = useForwardBook();

  const value = Number(amount);
  const quote =
    book && until === QUOTED_UNTIL ? quoteForward(book, value, account.currency as "USDC" | "cNGN", Date.now()) : null;
  const canQuoteWithoutAmount = book ? quoteForward(book, 0, account.currency as "USDC" | "cNGN", Date.now()) !== null : false;

  let rateMessage = "Unavailable";
  if (until !== QUOTED_UNTIL) {
    rateMessage = "No market for this date";
  } else if (isRatePending) {
    rateMessage = "Loading";
  } else if (canQuoteWithoutAmount) {
    rateMessage = "Not enough liquidity for this amount";
  }

  const exceedsBalance = value > Number(account.balance);
  // Nothing locks a rate yet and every balance is a placeholder 0.00, so this stays false.
  const canLockRate = value > 0 && !exceedsBalance && quote !== null;

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className={cn(LARGE_FIGURE, "flex items-baseline justify-center")}>
        <span className="text-black/40 dark:text-white/50">{account.symbol}</span>
        <input
          autoFocus
          aria-label="Amount"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d*\.?\d{0,2}$/.test(next)) {
              setAmount(next);
            }
          }}
          style={{ width: `${Math.max(amount.length, 1)}ch` }}
          className="max-w-[80%] bg-transparent text-[#141414] outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/30"
        />
      </div>
      <p
        aria-live="polite"
        className={cn(
          FIGURE_CAPTION,
          exceedsBalance ? "text-[#B4412F] dark:text-[#E98A7A]" : "text-black/60 dark:text-white/60"
        )}
      >
        {exceedsBalance ? "Exceeds your available balance" : `Amount in ${account.currency}`}
      </p>

      <div className="mt-6">
        <span id="lock-rate-account" className={FIELD_LABEL}>
          Account
        </span>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-labelledby="lock-rate-account lock-rate-account-value"
              className={cn(FIELD_PILL, "pl-[11px] pr-[18px]")}
            >
              <Image src={account.iconSrc} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 rounded-full object-cover" />
              <span id="lock-rate-account-value" className="flex min-w-0 items-baseline gap-2.5 text-[16px] font-medium text-[#141414] dark:text-white">
                {account.currency}
                <span className={cn(AVAILABLE, "truncate font-normal")}>
                  {account.symbol}
                  {account.balance} available
                </span>
              </span>
              <ChevronDown className={FIELD_CHEVRON} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className={cn(MENU_CONTENT, "w-[var(--radix-dropdown-menu-trigger-width)]")}
            >
              {ACCOUNTS.map(({ iconSrc, currency, symbol, balance }) => (
                <DropdownMenu.Item
                  key={currency}
                  onSelect={() => setAccountCode(currency)}
                  className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
                >
                  <span className="flex items-center gap-2.5 font-medium">
                    <Image src={iconSrc} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-full object-cover" />
                    {currency}
                  </span>
                  <span className={AVAILABLE}>
                    {symbol}
                    {balance} available
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-4">
        <span id="lock-rate-until" className={FIELD_LABEL}>
          Until
        </span>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-labelledby="lock-rate-until lock-rate-until-value"
              className={FIELD_PILL}
            >
              <Calendar className="h-4 w-4 shrink-0 text-black/60 dark:text-white/60" strokeWidth={1.75} aria-hidden="true" />
              <span id="lock-rate-until-value" className="text-[16px] font-medium text-[#141414] dark:text-white">
                {until}
              </span>
              <ChevronDown className={FIELD_CHEVRON} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className={cn(MENU_CONTENT, "w-[var(--radix-dropdown-menu-trigger-width)]")}
            >
              {UNTIL_DATES.map((date) => (
                <DropdownMenu.Item
                  key={date}
                  onSelect={() => setUntil(date)}
                  className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
                >
                  {date}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-6">
        <p className={cn(LARGE_FIGURE, "text-center", quote === null ? "text-black/25 dark:text-white/30" : "text-[#141414] dark:text-white")}>
          {quote === null ? "—" : formatNumber(quote.rate)}
        </p>
        <p className={cn(FIGURE_CAPTION, "text-black/60 dark:text-white/60")}>
          {quote === null ? rateMessage : "Forward rate in cNGN per USDC, after fees"}
        </p>
        {quote === null ? null : <RateBreakdown quote={quote} currency={account.currency} />}
      </div>

      <button
        type="submit"
        disabled={!canLockRate}
        className="mt-7 h-[50px] w-full rounded-full bg-[#141414] text-[16px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5DDD0] disabled:text-black/55 dark:bg-white dark:text-[#141414] dark:disabled:bg-white/10 dark:disabled:text-white/40"
      >
        Lock rate
      </button>
    </form>
  );
}

/** The dashboard's "Move money" button: its menu of actions and the Lock rate dialog. */
export function MoveMoney({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isLockRateOpen, setIsLockRateOpen] = useState(false);

  return (
    <>
      {/* Not modal: a modal menu handing focus to a dialog leaves the page unclickable after it closes. */}
      <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-[46px] shrink-0 items-center gap-2 rounded-full bg-[#141414] px-[22px] text-[15px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-[#141414] dark:hover:bg-white/90"
          >
            Move money
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={cn(MENU_CONTENT, "w-[240px]")}>
            <DropdownMenu.Item
              onSelect={() => setIsLockRateOpen(true)}
              className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
            >
              Lock rate
            </DropdownMenu.Item>
            {SOON_ACTIONS.map((action) => (
              <DropdownMenu.Item key={action} disabled className={cn(MENU_ITEM, "text-black/45 dark:text-white/40")}>
                {action}
                <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[12px] text-black/60 dark:bg-white/10 dark:text-white/60">
                  Soon
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={isLockRateOpen} onOpenChange={setIsLockRateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[464px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[32px] bg-[#EDE5DA] p-3 outline-none dark:bg-[#242424]"
          >
            <div className="relative overflow-y-auto overscroll-y-contain rounded-[24px] bg-[#FDFBF7] px-5 pb-7 pt-6 dark:bg-[#1A1A1A] sm:px-7">
              <Dialog.Title className="text-center text-[17px] font-semibold tracking-[-0.01em] text-[#141414] dark:text-white">
                Lock rate
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="absolute right-[34px] top-6 flex h-7 w-7 items-center justify-center rounded-full text-[#141414]/80 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white/70 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Dialog.Close>
              <LockRateForm />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
