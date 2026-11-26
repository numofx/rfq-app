"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, Calendar, Check, ChevronDown, Copy, Info, Wallet, X } from "lucide-react";
import { ACCOUNTS } from "@/components/dashboard/account-cards";
import { CurrencyIcon } from "@/components/dashboard/currency-icon";
import { canTrade, CONFIRMED_BUTTON, EmailVerification, TradeAction, WalletStep, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { INITIAL_MARGIN_RATE, quoteForward, type ForwardQuote } from "@/lib/forward-quote";
import { useForwardBook } from "@/lib/hooks/useForwardRate";
import { useVenueMarket, useWalletUsdc } from "@/lib/hooks/useTrading";
import { depositUsdc, MIN_DEPOSIT_USDC } from "@/lib/venue/deposit";
import { TOKEN_DECIMALS, withdraw } from "@/lib/venue/withdraw";
import { createWalletClient, custom, formatUnits, parseUnits } from "viem";
import { useSendTransaction } from "@privy-io/react-auth";
import { createBasePublicClient, getAppChain } from "@/lib/venue/config";
import { recipientProblem, usdcTransfer, waitForTransfer } from "@/lib/venue/send";
import { FUTURE_SYMBOL, type VenueMarket } from "@/lib/venue/market";
import { ExchangeStopped, MIN_DEPOSIT, runExchange, type ExchangeResume, type SendCall } from "@/lib/venue/exchange";
import { loadResume, resumeHolding, saveResume } from "@/lib/venue/exchange-resume";
import { EXCHANGE_TOKENS, fetchZeroExQuote } from "@/lib/zeroex";
import { useWalletTokens, WALLET_DUST } from "@/lib/hooks/useWalletTokens";
import { isFullyFilled, placeOrder, planOrder, type OrderPlan, type PlacedOrder } from "@/lib/venue/place-order";
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

type Currency = "USDC" | "cNGN";
type Account = (typeof ACCOUNTS)[number];
type Status = { tone: "neutral" | "error"; text: string } | null;
type DialogKind = "lock-rate" | "exchange" | "deposit" | "withdraw" | "send";

const MENU_ITEM =
  "flex h-[42px] items-center justify-between gap-4 rounded-lg px-3 text-[15px] text-[#141414] outline-none dark:text-white";
const MENU_CONTENT =
  "z-50 rounded-2xl bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:bg-[#1A1A1A]";
const FIELD_LABEL = "block pl-1 text-[14px] font-medium text-[#141414] dark:text-white";
const FIELD_PILL =
  "mt-2 flex h-12 w-full items-center gap-2.5 rounded-full bg-[#EFE7DC] px-4 outline-none focus-within:ring-2 focus-within:ring-black/15 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:focus-within:ring-white/20 dark:focus-visible:ring-white/20";
const FIELD_CHEVRON = "ml-auto h-4 w-4 shrink-0 text-black/60 dark:text-white/60";
const AVAILABLE = "font-mono text-black/60 dark:text-white/60";
const ERROR_TEXT = "text-[#B4412F] dark:text-[#E98A7A]";

const formatNumber = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSigned = (value: number) => `${value < 0 ? "−" : "+"}${formatNumber(Math.abs(value))}`;

const formatPercent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

const formatMoney = (currency: Currency, value: number) => `${currency === "USDC" ? "$" : "₦"}${formatNumber(value)}`;

function otherCurrency(currency: Currency): Currency {
  return currency === "USDC" ? "cNGN" : "USDC";
}

function balanceOf(session: TradeSession | null, currency: Currency) {
  const balances = session?.balances;
  if (!balances) return null;
  return currency === "USDC" ? balances.usdc : balances.cngn;
}

/** What the venue reported for a placed order, in words. */
function describeOutcome(order: PlacedOrder, market: VenueMarket, filledText: (cngn: number) => string): Status {
  const filledUnits = Number(order.outcome?.filled_amount ?? "0");
  const status = order.outcome?.status;
  if (status === "filled") return { tone: "neutral", text: filledText(order.units * market.unitCngn) };
  if (filledUnits > 0) {
    return {
      tone: "neutral",
      text: `${filledText(filledUnits * market.unitCngn)} The rest lapses in 2 minutes if it doesn't fill.`,
    };
  }
  if (status === "expired" || status === "cancelled") {
    return { tone: "error", text: "Nothing filled: the price moved before the order matched. Try again." };
  }
  return { tone: "neutral", text: "Order placed. It lapses in 2 minutes if the book doesn't fill it." };
}

function RateCardRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-black/70 dark:text-white/70">
        {label}
        {hint ? <span className="text-black/50 dark:text-white/50"> ({hint})</span> : null}
      </dt>
      <dd className="text-right font-mono text-[#141414] dark:text-white">{value}</dd>
    </div>
  );
}

/** The rate and what locking the amount comes to, with how the rate is made up behind "Show details". */
function RateCard({ quote, currency, message }: { quote: ForwardQuote | null; currency: string; message: string }) {
  const [showDetails, setShowDetails] = useState(false);
  const position = quote?.position ?? null;
  const hasRows = quote !== null && (position !== null || showDetails);
  const premium =
    quote === null || quote.annualizedPremium === null
      ? ""
      : ` (${quote.annualizedPremium < 0 ? "−" : "+"}${formatPercent(Math.abs(quote.annualizedPremium))} a year)`;

  return (
    <div className="mt-5 rounded-2xl bg-[#F3EFE9] text-[14px] dark:bg-white/5">
      <div className="flex items-baseline justify-between gap-4 px-[18px] py-3.5">
        <p className="min-w-0 font-medium text-[#141414] dark:text-white">
          Rate{" "}
          <span className="text-[13px] font-normal text-black/60 dark:text-white/60">
            {quote === null ? message : "cNGN per USDC, after fees"}
          </span>
        </p>
        <p
          className={cn(
            "shrink-0 font-mono text-[20px] font-semibold leading-none",
            quote === null ? "text-black/25 dark:text-white/30" : "text-[#141414] dark:text-white"
          )}
        >
          {quote === null ? "—" : formatNumber(quote.rate)}
        </p>
      </div>

      {hasRows ? (
        <dl className="mx-[18px] space-y-2 border-t border-black/[0.07] pb-3 pt-3 dark:border-white/10">
          {position ? (
            <>
              <RateCardRow
                label="You lock"
                value={currency === "USDC" ? `₦${formatNumber(position.locked)}` : `$${formatNumber(position.locked)}`}
              />
              <RateCardRow
                label="Margin required"
                hint={`${INITIAL_MARGIN_RATE * 100}%`}
                value={`$${formatNumber(position.marginUsdc)}`}
              />
            </>
          ) : null}
          {showDetails ? (
            <>
              <RateCardRow label="Spot rate" value={formatNumber(quote.spot)} />
              <RateCardRow label="Forward points" value={`${formatSigned(quote.points)}${premium}`} />
              <RateCardRow
                label="Fee"
                hint={formatPercent(quote.feeRate)}
                value={`${formatSigned(quote.feePoints)}${position ? ` ($${formatNumber(position.feeUsdc)})` : ""}`}
              />
              <RateCardRow
                label="Settles"
                value={`In ${quote.daysToExpiry} ${quote.daysToExpiry === 1 ? "day" : "days"}, cash in USDC`}
              />
            </>
          ) : null}
        </dl>
      ) : null}

      {quote === null ? null : (
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((current) => !current)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-b-2xl border-t border-black/[0.07] text-[13px] font-medium text-[#141414] outline-none hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/15 dark:border-white/10 dark:text-white dark:hover:bg-white/5 dark:focus-visible:ring-white/20"
        >
          {showDetails ? "Hide details" : "Show details"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function AmountField({
  account,
  amount,
  onAmountChange,
  caption,
  isError,
}: {
  account: Account;
  amount: string;
  onAmountChange: (amount: string) => void;
  caption: string;
  isError: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-center font-mono text-[48px] font-semibold leading-none tracking-[-0.02em]">
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
              onAmountChange(next);
            }
          }}
          style={{ width: `${Math.max(amount.length, 1)}ch` }}
          className="max-w-[80%] bg-transparent text-[#141414] outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/30"
        />
      </div>
      <p aria-live="polite" className={cn("mt-2 h-5 text-center text-[13px]", isError ? ERROR_TEXT : "text-black/60 dark:text-white/60")}>
        {caption}
      </p>
    </>
  );
}

function AccountPicker({
  id,
  label,
  account,
  session,
  onSelect,
}: {
  id: string;
  label: string;
  account: Account;
  session: TradeSession | null;
  onSelect: (currency: Currency) => void;
}) {
  const formatAvailable = (currency: Currency, symbol: string) => {
    const balance = balanceOf(session, currency);
    return balance === null ? `${symbol}—` : `${symbol}${formatNumber(balance)}`;
  };

  return (
    <div className="min-w-0">
      <span id={id} className={FIELD_LABEL}>
        {label}
      </span>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-labelledby={`${id} ${id}-value`} className={cn(FIELD_PILL, "pl-[9px] pr-3.5")}>
            <CurrencyIcon account={account} size={26} />
            <span id={`${id}-value`} className="min-w-0 text-left text-[14px] font-medium leading-tight text-[#141414] dark:text-white">
              <span className="block">{account.fiat}</span>
              <span className={cn(AVAILABLE, "block truncate text-[12px] font-normal")}>
                {formatAvailable(account.currency as Currency, account.symbol)} avail.
              </span>
            </span>
            <ChevronDown className={FIELD_CHEVRON} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className={cn(MENU_CONTENT, "min-w-[var(--radix-dropdown-menu-trigger-width)]")}>
            {ACCOUNTS.map((option) => (
              <DropdownMenu.Item
                key={option.currency}
                onSelect={() => onSelect(option.currency as Currency)}
                className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <CurrencyIcon account={option} size={22} />
                  {option.fiat}
                </span>
                <span className={cn(AVAILABLE, "text-[13px]")}>{formatAvailable(option.currency as Currency, option.symbol)} available</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** Signs and places `plan`, then reports what filled. Shared by both dialogs. */
function useOrderSubmission(session: TradeSession | null) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // Set when the order filled in full: the button says so, until the form is changed.
  const [isConfirmed, setIsConfirmed] = useState(false);

  async function submit(market: VenueMarket, plan: OrderPlan, filledText: (cngn: number) => string) {
    if (!canTrade(session)) return;
    setIsSubmitting(true);
    setStatus(null);
    setIsConfirmed(false);
    try {
      const order = await placeOrder({ market, plan, subaccountId: session.subaccountId, wallet: session.wallet });
      if (isFullyFilled(order.outcome, order.units)) {
        setIsConfirmed(true);
      } else {
        setStatus(describeOutcome(order, market, filledText));
      }
      session.refreshBalances();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "The order could not be placed." });
    } finally {
      setIsSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  }

  /** Clears the last outcome, once the user starts entering the next order. */
  function reset() {
    setStatus(null);
    setIsConfirmed(false);
  }

  return { isConfirmed, isSubmitting, status, reset, submit };
}

/** Locks a forward rate: a market order on the cNGN-30NOV26 future. Mounted only while open. */
function LockRateForm({ session }: { session: TradeSession | null }) {
  const [amount, setAmount] = useState("");
  const [accountCode, setAccountCode] = useState<Currency>("USDC");
  const [until, setUntil] = useState(UNTIL_DATES[0]);
  const account = ACCOUNTS.find(({ currency }) => currency === accountCode) ?? ACCOUNTS[0];
  const { book, isPending: isRatePending } = useForwardBook();
  const { market } = useVenueMarket(FUTURE_SYMBOL);
  const { isConfirmed, isSubmitting, status, reset, submit } = useOrderSubmission(session);

  const value = Number(amount);
  const isQuotedDate = until === QUOTED_UNTIL;
  const quote = book && isQuotedDate ? quoteForward(book, value, accountCode, Date.now()) : null;
  const canQuoteWithoutAmount = book ? quoteForward(book, 0, accountCode, Date.now()) !== null : false;

  let rateMessage = "Unavailable";
  if (!isQuotedDate) {
    rateMessage = "No market for this date";
  } else if (isRatePending) {
    rateMessage = "Loading";
  } else if (canQuoteWithoutAmount) {
    rateMessage = "Not enough liquidity for this amount";
  }

  const plan = market && isQuotedDate && value > 0 ? planOrder(market, accountCode, value) : null;
  const surplus = session?.balances?.imSurplusUsd ?? null;
  const marginNeeded = plan && typeof plan !== "string" ? (plan.marginUsdc ?? 0) + plan.feeUsdc : null;
  const isShortOfMargin = marginNeeded !== null && surplus !== null && marginNeeded > surplus;

  let disabledReason: string | null = null;
  if (!(value > 0) || !isQuotedDate) disabledReason = "";
  else if (plan === null) disabledReason = "Loading the market";
  else if (typeof plan === "string") disabledReason = plan;
  else if (isShortOfMargin) {
    disabledReason = `Needs ${formatMoney("USDC", marginNeeded)} of margin. You have ${formatMoney("USDC", Math.max(surplus, 0))}.`;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabledReason !== null || !market || !plan || typeof plan === "string") return;
    const rate = 1 / plan.expectedPrice;
    void submit(market, plan, (cngn) => `Locked ₦${formatNumber(cngn)} at about ${formatNumber(rate)} cNGN per USDC.`);
  }

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <AmountField
        account={account}
        amount={amount}
        onAmountChange={(next) => {
          setAmount(next);
          reset();
        }}
        caption={isShortOfMargin && !isConfirmed ? "Not enough margin for this amount" : `Amount in ${account.fiat}`}
        isError={isShortOfMargin && !isConfirmed}
      />

      {/* Too narrow side by side on a phone. */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <AccountPicker id="lock-rate-account" label="Account" account={account} session={session} onSelect={setAccountCode} />

        <div className="min-w-0">
          <span id="lock-rate-until" className={FIELD_LABEL}>
            Until
          </span>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button type="button" aria-labelledby="lock-rate-until lock-rate-until-value" className={FIELD_PILL}>
                <Calendar className="h-4 w-4 shrink-0 text-black/60 dark:text-white/60" strokeWidth={1.75} aria-hidden="true" />
                <span id="lock-rate-until-value" className="truncate text-[14px] font-medium text-[#141414] dark:text-white">
                  {until}
                </span>
                <ChevronDown className={FIELD_CHEVRON} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={6} className={cn(MENU_CONTENT, "w-[var(--radix-dropdown-menu-trigger-width)]")}>
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
      </div>

      <RateCard quote={quote} currency={account.currency} message={rateMessage} />

      <div className="mt-5">
        <TradeAction session={session} label="Lock rate" disabledReason={disabledReason} isSubmitting={isSubmitting} isConfirmed={isConfirmed} status={status} />
      </div>
    </form>
  );
}

const SWAP_PANEL = "rounded-2xl px-5 pb-4 pt-4 transition-colors";
const SWAP_PANEL_IDLE = "bg-[#F3EFE9] dark:bg-white/5";
const SWAP_PANEL_ERROR = "bg-[#FBEBE7] dark:bg-[#E98A7A]/10";
const SWAP_LABEL = "text-[14px] text-black/70 dark:text-white/70";
const SWAP_BALANCE = "font-mono text-[12px] text-black/60 dark:text-white/60";

/** The white currency pill on a swap panel, with a menu of the accounts. */
function TokenPicker({ label, account, onSelect }: { label: string; account: Account; onSelect: (currency: Currency) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${account.fiat}`}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-[15px] font-semibold text-[#141414] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:focus-visible:ring-white/20"
        >
          <CurrencyIcon account={account} size={32} />
          {account.fiat}
          <ChevronDown className="h-4 w-4 text-black/60 dark:text-white/60" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={cn(MENU_CONTENT, "min-w-[180px]")}>
          {ACCOUNTS.map((option) => (
            <DropdownMenu.Item
              key={option.currency}
              onSelect={() => onSelect(option.currency as Currency)}
              className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
            >
              <span className="flex items-center gap-2.5 font-medium">
                <CurrencyIcon account={option} size={22} />
                {option.fiat}
              </span>
              {option.currency === account.currency ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SwapDetailRow({
  label,
  value,
  strong = false,
  hint,
  skeletonWidth,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Explains the row, behind an info icon next to its label. */
  hint?: string;
  /** Set while the value loads: a placeholder bar this wide stands in for it. */
  skeletonWidth?: number;
}) {
  return (
    <div className="flex h-5 items-center justify-between gap-4">
      <dt className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap", strong ? "font-semibold text-[#141414] dark:text-white" : "text-black/70 dark:text-white/70")}>
        {label}
        {hint ? (
          <span title={hint} aria-label={hint} role="img" className="inline-flex text-black/45 dark:text-white/45">
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
      </dt>
      {skeletonWidth ? (
        <dd aria-label="Loading" className={SKELETON} style={{ width: skeletonWidth }} />
      ) : (
        <dd className={cn("min-w-0 truncate text-right font-mono text-[#141414] dark:text-white", strong && "font-semibold")} title={value}>
          {value}
        </dd>
      )}
    </div>
  );
}

const SKELETON = "h-4 animate-pulse rounded-md bg-black/[0.07] dark:bg-white/10";
const SWAP_PANEL_WARNING = "bg-[#FBF2E2] ring-1 ring-inset ring-[#E8C88C] dark:bg-[#E8C88C]/10 dark:ring-[#E8C88C]/40";
const WARNING_TEXT = "text-[#8A5A12] dark:text-[#E8C88C]";
/** Amounts as the mockup writes them: up to two decimals, no trailing zeros. */
const formatAmount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The sizes the bought amount steps down through, largest first. */
const BUY_AMOUNT_SIZES = [44, 38, 32, 28, 24, 20, 17, 14];

/**
 * The bought amount at the largest size that fits beside the token pill, measured rather than guessed from
 * its length: the font and the pill's width vary by platform, so a character count cuts it off on some.
 */
function FitAmount({ text, className, label }: { text: string; className: string; label: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState(BUY_AMOUNT_SIZES[0]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      for (const candidate of BUY_AMOUNT_SIZES) {
        element.style.fontSize = `${candidate}px`;
        if (element.scrollWidth <= element.clientWidth) {
          setSize(candidate);
          return;
        }
      }
      setSize(BUY_AMOUNT_SIZES[BUY_AMOUNT_SIZES.length - 1]);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return (
    <p ref={ref} aria-label={label} className={className} style={{ fontSize: size }}>
      {text}
    </p>
  );
}

/** Seconds until react-query refetches the price, ticking down once a second. */
function useRefreshCountdown(updatedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!updatedAt) return null;
  return Math.max(0, Math.ceil((updatedAt + PRICE_POLL_MS - now) / 1000));
}

/** Sells this much to read the rate before an amount is entered: about $100 either way. */
const REFERENCE_SELL: Record<Currency, number> = { USDC: 100, cNGN: 150_000 };
const PRICE_DEBOUNCE_MS = 400;
const PRICE_POLL_MS = 15_000;

const toUnits = (currency: Currency, value: number) =>
  parseUnits(value.toFixed(EXCHANGE_TOKENS[currency].decimals), EXCHANGE_TOKENS[currency].decimals);
const fromUnits = (currency: Currency, units: string | bigint) => Number(formatUnits(BigInt(units), EXCHANGE_TOKENS[currency].decimals));
const FIAT: Record<Currency, string> = { USDC: "USD", cNGN: "NGN" };

/** 0x's indicative price for selling `value` of `sell`, refreshed while the dialog is open. */
function useExchangePrice(sell: Currency, value: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), PRICE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  const sellValue = debounced > 0 ? debounced : REFERENCE_SELL[sell];
  const sellUnits = toUnits(sell, sellValue);
  const { data, dataUpdatedAt, error, isPending } = useQuery({
    queryKey: ["zeroex-price", sell, sellUnits.toString()],
    queryFn: ({ signal }) => fetchZeroExQuote({ sell, sellUnits, signal }),
    refetchInterval: PRICE_POLL_MS,
    retry: 1,
  });
  const price = data && data.liquidityAvailable ? data : null;
  return {
    price,
    /** Whether `price` is for the amount entered, rather than the reference amount or a stale one. */
    isForAmount: price !== null && debounced > 0 && debounced === value,
    isPending: isPending || debounced !== value,
    updatedAt: dataUpdatedAt,
    error: data && !data.liquidityAvailable ? "Not enough liquidity for this amount" : error ? error.message : null,
  };
}

/** Gas assumed for a call that names none (an approval is ~50k): only sizes the self-pay check. */
const DEFAULT_GAS_FOR_CHECK = 300_000n;

/**
 * Sends a wallet transaction. The embedded wallet pays its own gas when it holds enough ETH, and only otherwise
 * asks Privy to sponsor it: Privy's sponsored request carries no gas limit, so 0x's limit (which the cNGN route
 * needs, see lib/venue/exchange.ts) is kept only when the wallet pays. A browser wallet always pays its own.
 */
function useSendCall(wallet: TradeSession["wallet"]): SendCall {
  const { sendTransaction } = useSendTransaction();
  return async ({ gas, ...call }) => {
    if (!wallet) throw new Error("No wallet");
    const chain = getAppChain();
    if (wallet.walletClientType === "privy") {
      const client = createBasePublicClient();
      const [balance, fees] = await Promise.all([
        client.getBalance({ address: wallet.address as `0x${string}` }),
        client.estimateFeesPerGas().catch(() => null),
      ]);
      const perGas = fees?.maxFeePerGas ?? fees?.gasPrice ?? null;
      const canPay = perGas !== null && balance >= (gas ?? DEFAULT_GAS_FOR_CHECK) * perGas * 2n;
      const { hash } = await sendTransaction(
        { ...call, chainId: chain.id, ...(gas === undefined ? {} : { gasLimit: gas }) },
        { ...(canPay ? {} : { sponsor: true }), address: wallet.address, uiOptions: { showWalletUIs: false } }
      );
      return hash;
    }
    await wallet.switchChain(chain.id);
    const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });
    return walletClient.sendTransaction({ account: wallet.address as `0x${string}`, ...call, gas });
  };
}

/**
 * Exchanges between the trading account's balances at 0x's rate, the same routing swap.numofx.com uses. 0x
 * swaps wallet tokens, so the exchange withdraws to the wallet, swaps, and deposits the proceeds back
 * (lib/venue/exchange.ts); if a step stops, the dialog offers to continue it. Mounted only while open.
 */
function ExchangeForm({ session }: { session: TradeSession | null }) {
  if (session === null) return <ExchangeFormBody session={null} sendCall={null} />;
  return <ExchangeFormWithWallet session={session} />;
}

function ExchangeFormWithWallet({ session }: { session: TradeSession }) {
  const sendCall = useSendCall(session.wallet);
  return <ExchangeFormBody session={session} sendCall={sendCall} />;
}

function ExchangeFormBody({ session, sendCall }: { session: TradeSession | null; sendCall: SendCall | null }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [fromCode, setFromCode] = useState<Currency>("USDC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState("Exchanging");
  const [status, setStatus] = useState<Status>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  // Set when a step stopped after money left the account: what is in the wallet, and the step that picks it up.
  const [resume, setResume] = useState<ExchangeResume | null>(null);
  const from = ACCOUNTS.find(({ currency }) => currency === fromCode) ?? ACCOUNTS[0];
  const toCode = otherCurrency(fromCode);
  const to = ACCOUNTS.find(({ currency }) => currency === toCode) ?? ACCOUNTS[1];

  const walletAddress = session?.wallet?.address ?? null;
  const walletTokens = useWalletTokens(walletAddress);

  // A stopped exchange saved by an earlier visit: restore it once, if the wallet still holds its money.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  useEffect(() => {
    if (walletAddress === null || walletTokens === null || restoredFor === walletAddress) return;
    setRestoredFor(walletAddress);
    const saved = loadResume(walletAddress);
    if (saved === null) return;
    const holding = resumeHolding(saved);
    if (walletTokens[holding.currency] < holding.units) {
      saveResume(walletAddress, null); // spent or moved elsewhere since: nothing to pick up
      return;
    }
    setResume(saved);
    if (saved.stage === "swap") {
      setFromCode(saved.sell);
      setAmount(fromUnits(saved.sell, saved.sellUnits).toFixed(2));
    } else {
      setFromCode(otherCurrency(saved.currency));
    }
    setStatus({
      tone: "neutral",
      text: `An earlier exchange stopped with ${formatNumber(fromUnits(holding.currency, holding.units))} ${FIAT[holding.currency]} in your wallet.`,
    });
  }, [walletAddress, walletTokens, restoredFor]);

  // Money in the wallet that no saved exchange accounts for: offered to exchange or deposit.
  const strayFunds =
    resume === null && !isSubmitting && walletTokens !== null && restoredFor === walletAddress
      ? (["USDC", "cNGN"] as const).filter((currency) => walletTokens[currency] >= WALLET_DUST[currency])
      : [];

  const value = Number(amount);
  const { price, isForAmount, isPending, updatedAt, error: priceError } = useExchangePrice(fromCode, value);
  const refreshIn = useRefreshCountdown(updatedAt);
  const available = balanceOf(session, fromCode);
  const toBalance = balanceOf(session, toCode);
  const exceedsBalance = available !== null && value > available;
  const isError = exceedsBalance && !isConfirmed && resume === null;

  const sold = price ? fromUnits(fromCode, price.sellAmount) : null;
  const bought = price ? fromUnits(toCode, price.buyAmount) : null;
  // Rates read as NGN per USD whichever way the exchange runs.
  const rate = sold && bought ? (fromCode === "USDC" ? bought / sold : sold / bought) : null;
  const receive = isForAmount ? bought : null;
  const minReceive = isForAmount && price ? fromUnits(toCode, price.minBuyAmount) : null;
  const valueUsd = fromCode === "USDC" ? value : rate ? value / rate : null;
  const zeroExFee = price?.fees?.zeroExFee ?? null;
  const feeCurrency = zeroExFee
    ? ((Object.keys(EXCHANGE_TOKENS) as Currency[]).find((code) => EXCHANGE_TOKENS[code].address.toLowerCase() === zeroExFee.token.toLowerCase()) ?? null)
    : null;
  const feeText =
    isForAmount && zeroExFee && feeCurrency
      ? `${formatNumber(fromUnits(feeCurrency, zeroExFee.amount))} ${FIAT[feeCurrency]}${
          feeCurrency === fromCode && sold ? ` (${formatPercent(fromUnits(feeCurrency, zeroExFee.amount) / sold)})` : ""
        }`
      : "—";
  const belowMinimum = minReceive !== null && minReceive < MIN_DEPOSIT[toCode];
  // The sell that clears the venue's deposit minimum even at full slippage, which is what the exchange checks
  // before swapping (lib/venue/exchange.ts), rounded up to the cent.
  const minimumSell =
    belowMinimum && minReceive !== null && minReceive > 0 ? Math.ceil(((MIN_DEPOSIT[toCode] * value) / minReceive) * 100) / 100 : null;
  // An amount is entered and its rate is on the way: placeholders, not the reference rate.
  const isLoadingAmount = value > 0 && !exceedsBalance && !isForAmount && priceError === null && resume === null;

  let disabledReason: string | null = null;
  if (resume !== null) disabledReason = null;
  else if (!(value > 0)) disabledReason = "";
  else if (exceedsBalance) disabledReason = "";
  else if (priceError) disabledReason = priceError;
  else if (!isForAmount) disabledReason = isPending ? "" : "The rate is unavailable";
  else if (belowMinimum) disabledReason = "";

  function clearOutcome() {
    setStatus(null);
    setIsConfirmed(false);
  }

  function changeAmount(next: string) {
    if (resume !== null || isSubmitting) return;
    setAmount(next);
    clearOutcome();
  }

  function changeFrom(currency: Currency) {
    if (resume !== null || isSubmitting) return;
    setFromCode(currency);
    clearOutcome();
  }

  async function run(start: Parameters<typeof runExchange>[1]) {
    if (!canTrade(session) || sendCall === null) return;
    setIsSubmitting(true);
    clearOutcome();
    try {
      const done = await runExchange(
        { subaccountId: session.subaccountId, wallet: session.wallet, sendCall, onProgress: setProgress },
        start
      );
      setResume(null);
      saveResume(session.wallet.address, null);
      setAmount("");
      setIsConfirmed(true);
      setStatus({ tone: "neutral", text: `Added ${formatNumber(fromUnits(done.currency, done.units))} ${FIAT[done.currency]} to your account.` });
    } catch (error) {
      if (error instanceof ExchangeStopped) {
        setResume(error.resume);
        saveResume(session.wallet.address, error.resume);
      }
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "The exchange failed." });
    } finally {
      setIsSubmitting(false);
      setProgress("Exchanging");
      session.refreshBalances();
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-tokens"] });
    }
  }

  /** Picks up money already in the wallet: exchanges it for the other currency, or deposits it as it is. */
  function moveStray(currency: Currency, action: "exchange" | "deposit") {
    if (walletTokens === null) return;
    const units = walletTokens[currency];
    if (action === "exchange") {
      setFromCode(currency);
      setAmount(fromUnits(currency, units).toFixed(2));
      void run({ stage: "swap", sell: currency, sellUnits: units });
    } else {
      void run({ stage: "deposit", currency, units });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (resume !== null) {
      void run(resume);
      return;
    }
    if (disabledReason !== null) return;
    void run({ stage: "withdraw", sell: fromCode, sellUnits: toUnits(fromCode, value) });
  }

  const sellHint = fromCode === "cNGN" && value > 0 && valueUsd !== null ? `≈ ${formatMoney("USDC", valueUsd)}` : "";
  const strayRows =
    walletTokens === null
      ? []
      : strayFunds.map((currency) => {
          const held = fromUnits(currency, walletTokens[currency]);
          return { currency, held, canDeposit: held >= MIN_DEPOSIT[currency] };
        });

  let label = value > 0 ? `Exchange ${formatAmount(value)} ${from.fiat}` : "Enter an amount";
  if (isError) label = `Insufficient ${from.fiat} balance`;
  else if (isLoadingAmount) label = "Getting best rate…";
  else if (belowMinimum) label = minimumSell === null ? "Below the minimum" : `Minimum ${formatAmount(minimumSell)} ${from.fiat}`;
  if (resume?.stage === "swap") label = "Try the exchange again";
  else if (resume?.stage === "deposit") label = `Deposit the ${FIAT[resume.currency]} back`;

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <div className={cn(SWAP_PANEL, isError ? SWAP_PANEL_ERROR : SWAP_PANEL_IDLE)}>
        <div className="flex h-7 items-center justify-between gap-3">
          <span className={SWAP_LABEL}>You sell</span>
          <span className="flex items-center gap-2">
            <span className={cn(SWAP_BALANCE, isError && ERROR_TEXT)}>
              Balance {available === null ? "—" : formatNumber(available)} {from.fiat}
            </span>
            {available !== null && available > 0 ? (
              <button
                type="button"
                onClick={() => changeAmount((Math.floor(available * 100) / 100).toFixed(2))}
                className="h-6 rounded-full bg-white px-2.5 text-[12px] font-semibold text-[#141414] outline-none hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/10 dark:text-white"
              >
                Max
              </button>
            ) : null}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            autoFocus
            aria-label={`Amount to sell in ${from.fiat}`}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            readOnly={resume !== null || isSubmitting}
            onChange={(event) => {
              if (/^\d*\.?\d{0,2}$/.test(event.target.value)) changeAmount(event.target.value);
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-[44px] font-semibold leading-none tracking-[-0.02em] text-[#141414] outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/30"
          />
          <TokenPicker label="Sell" account={from} onSelect={changeFrom} />
        </div>
        {sellHint !== "" || isError || strayRows.length === 0 ? (
          <div className="mt-3 flex h-5 items-center justify-between gap-3 text-[13px]">
            <span className="font-mono text-black/60 dark:text-white/60">{sellHint}</span>
            <span aria-live="polite" className={cn("font-medium", ERROR_TEXT)}>
              {isError ? "Exceeds balance" : ""}
            </span>
          </div>
        ) : null}
        {strayRows.map(({ currency, held, canDeposit }) => (
          <div
            key={currency}
            className="mt-2 flex h-11 items-center gap-2 rounded-xl bg-white/70 pl-3 pr-1.5 text-[13px] dark:bg-white/[0.06]"
          >
            <Wallet className="h-4 w-4 shrink-0 text-black/55 dark:text-white/55" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[#141414] dark:text-white">
              +{formatNumber(held)} {FIAT[currency]}
              <span className="hidden sm:inline"> in your wallet</span>
            </span>
            <button
              type="button"
              onClick={() => moveStray(currency, "deposit")}
              disabled={!canDeposit}
              title={canDeposit ? "Deposit it to your account" : `Deposits start at ${formatNumber(MIN_DEPOSIT[currency])} ${FIAT[currency]}`}
              className="h-8 shrink-0 rounded-full px-2.5 font-semibold text-black/60 outline-none hover:text-[#141414] focus-visible:ring-2 focus-visible:ring-black/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white/60 dark:hover:text-white"
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => moveStray(currency, "exchange")}
              title={`Exchange it for ${FIAT[otherCurrency(currency)]}`}
              className="h-8 shrink-0 rounded-full bg-[#141414] px-3.5 font-semibold text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-black/25 dark:bg-white dark:text-[#141414] dark:hover:bg-white/85"
            >
              Sell it
            </button>
          </div>
        ))}
      </div>

      <div className="relative z-10 flex h-2 justify-center">
        <button
          type="button"
          aria-label="Swap sell and buy"
          onClick={() => changeFrom(toCode)}
          className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#EFE7DC] text-[#141414] ring-4 ring-[#FDFBF7] outline-none transition-colors hover:bg-[#E5DDD0] focus-visible:ring-black/20 dark:bg-[#2A2A2A] dark:text-white dark:ring-[#1A1A1A] dark:hover:bg-[#333]"
        >
          <ArrowUpDown className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className={cn(SWAP_PANEL, belowMinimum ? SWAP_PANEL_WARNING : SWAP_PANEL_IDLE, belowMinimum ? "pb-4" : "pb-6")}>
        <div className="flex h-7 items-center justify-between gap-3">
          <span className={SWAP_LABEL}>You buy</span>
          <span className={SWAP_BALANCE}>
            Balance {toBalance === null ? "—" : formatNumber(toBalance)} {to.fiat}
          </span>
        </div>
        <div className="mt-3 flex h-12 items-center gap-3">
          {isLoadingAmount ? (
            <div aria-label={`Amount to buy in ${to.fiat}: loading`} className="min-w-0 flex-1">
              <div className={cn(SKELETON, "h-10 w-[70%] max-w-[190px] rounded-lg")} />
            </div>
          ) : (
            <FitAmount
              label={`Amount to buy in ${to.fiat}`}
              text={receive === null ? "0" : formatNumber(receive)}
              className={cn(
                "min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono font-semibold leading-none tracking-[-0.02em]",
                receive === null ? "text-black/25 dark:text-white/30" : "text-[#141414] dark:text-white"
              )}
            />
          )}
          <TokenPicker label="Buy" account={to} onSelect={(currency) => changeFrom(otherCurrency(currency))} />
        </div>
        {belowMinimum ? (
          <p aria-live="polite" className={cn("mt-3 flex items-center gap-1.5 text-[13px]", WARNING_TEXT)}>
            <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              Minimum is {formatNumber(MIN_DEPOSIT[toCode])} {to.fiat}
              {minimumSell !== null ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => changeAmount(minimumSell.toFixed(2))}
                    className="font-semibold underline underline-offset-2 outline-none hover:opacity-75 focus-visible:ring-2 focus-visible:ring-black/15"
                  >
                    Sell {formatAmount(minimumSell)} {from.fiat}
                  </button>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <dl className="mt-5 space-y-2.5 px-5 text-[14px]">
        <SwapDetailRow
          label="Rate"
          value={rate === null ? (priceError ? "Unavailable" : "—") : `1 USD = ${formatNumber(rate)} NGN`}
          skeletonWidth={isLoadingAmount || (rate === null && priceError === null) ? 142 : undefined}
        />
        <SwapDetailRow label="Fee" value={feeText} skeletonWidth={isLoadingAmount ? 104 : undefined} />
        <SwapDetailRow
          label="Minimum received"
          hint="The least the exchange can pay out after slippage. It reverts rather than pay less."
          value={minReceive === null ? "—" : `${formatNumber(minReceive)} ${to.fiat}`}
          skeletonWidth={isLoadingAmount ? 112 : undefined}
        />
      </dl>

      <div className="mt-5">
        <TradeAction
          session={session}
          label={label}
          submittingLabel={progress}
          disabledReason={disabledReason}
          isSubmitting={isSubmitting}
          isConfirmed={isConfirmed}
          status={status}
          note={
            isForAmount && !belowMinimum && !isError && resume === null && !isSubmitting && refreshIn !== null ? (
              <span className="font-mono text-[12px]">Quote refreshes in 0:{String(refreshIn).padStart(2, "0")}</span>
            ) : undefined
          }
        />
        {resume?.stage === "swap" && !isSubmitting ? (
          <button
            type="button"
            onClick={() => void run({ stage: "deposit", currency: resume.sell, units: resume.sellUnits })}
            className={cn(NOTE, LINK, "mx-auto block")}
          >
            Return the {FIAT[resume.sell]} to your account instead
          </button>
        ) : null}
      </div>
    </form>
  );
}

const PRIMARY_BUTTON =
  "h-[50px] w-full rounded-full bg-[#141414] text-[16px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5DDD0] disabled:text-black/55 dark:bg-white dark:text-[#141414] dark:disabled:bg-white/10 dark:disabled:text-white/40";
const NOTE = "mt-3 text-center text-[13px] text-black/60 dark:text-white/60";
const LINK = "font-medium text-[#141414] underline underline-offset-2 hover:opacity-70 dark:text-white";
const BASESCAN_TX_URL = "https://basescan.org/tx/";

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Moves USDC from the trading wallet into its trading account, opening the account on the first
 * deposit. The venue pays the gas, so the wallet only needs the USDC. Mounted only while open.
 */
function DepositForm({ session }: { session: TradeSession | null }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // Set once the venue confirms a deposit: the button says so, until the amount is changed.
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const address = session?.wallet?.address ?? null;
  const walletUsdc = useWalletUsdc(address);
  const usdc = ACCOUNTS[0];

  const value = Number(amount);
  const isBelowMinimum = value > 0 && value < MIN_DEPOSIT_USDC;
  const exceedsWallet = walletUsdc !== null && value > walletUsdc;
  let caption = "Amount in USDC";
  if (isBelowMinimum) caption = `The minimum deposit is ${formatMoney("USDC", MIN_DEPOSIT_USDC)}`;
  else if (exceedsWallet) caption = "More than your wallet holds";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session?.wallet || session.isResolving || !(value >= MIN_DEPOSIT_USDC) || exceedsWallet) return;
    setIsSubmitting(true);
    setStatus(null);
    setIsConfirmed(false);
    try {
      const record = await depositUsdc({ amountUsdc: amount, subaccountId: session.subaccountId, wallet: session.wallet });
      if (record.status === "confirmed") {
        setIsConfirmed(true);
      } else if (record.status === "reverted" || record.status === "rejected") {
        setStatus({ tone: "error", text: record.error || "The deposit didn't go through. Nothing was moved." });
      } else {
        setStatus({ tone: "neutral", text: "Deposit submitted. It can take a minute to show in your account." });
      }
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "The deposit could not be sent." });
    } finally {
      setIsSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: ["trading-subaccount"] });
      void queryClient.invalidateQueries({ queryKey: ["trading-balances"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  }

  let action: ReactNode;
  if (session === null) {
    action = (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>Deposit</button>
        <p className={NOTE}>Deposits aren&apos;t available yet.</p>
      </>
    );
  } else if (!session.isReady) {
    action = <button type="button" disabled className={PRIMARY_BUTTON}>Loading</button>;
  } else if (!session.isAuthenticated) {
    action = <EmailVerification session={session} />;
  } else if (session.wallet === null) {
    action = <WalletStep session={session} label="Deposit" />;
  } else {
    const isWaiting = session.isResolving;
    action = (
      <>
        <button
          type="submit"
          disabled={isConfirmed || isWaiting || isSubmitting || !(value >= MIN_DEPOSIT_USDC) || exceedsWallet}
          className={cn(
            PRIMARY_BUTTON,
            "flex items-center justify-center gap-2",
            isConfirmed && CONFIRMED_BUTTON
          )}
        >
          {isConfirmed ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Confirmed
            </>
          ) : isSubmitting ? (
            "Depositing"
          ) : (
            "Deposit"
          )}
        </button>
        <p aria-live="polite" className={cn(NOTE, "min-h-5", status?.tone === "error" && ERROR_TEXT)}>
          {status?.text ?? (isConfirmed ? "" : isWaiting ? "Finding your trading account" : session.subaccountId === null ? "Your first deposit opens your trading account." : "")}
        </p>
      </>
    );
  }

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <AmountField
        account={usdc}
        amount={amount}
        onAmountChange={(next) => {
          setAmount(next);
          setStatus(null);
          setIsConfirmed(false);
        }}
        caption={caption}
        isError={isBelowMinimum || exceedsWallet}
      />

      <div className="mt-5 rounded-2xl bg-[#F3EFE9] text-[14px] dark:bg-white/5">
        <div className="flex items-baseline justify-between gap-4 px-[18px] py-3.5">
          <p className="min-w-0 font-medium text-[#141414] dark:text-white">
            Wallet <span className="text-[13px] font-normal text-black/60 dark:text-white/60">ready to deposit</span>
          </p>
          <p className="shrink-0 font-mono text-[20px] font-semibold leading-none text-[#141414] dark:text-white">
            {walletUsdc === null ? "—" : formatMoney("USDC", walletUsdc)}
          </p>
        </div>
        {/* What has already moved across, so a deposit doesn't look like it vanished from the wallet. */}
        {session?.balances ? (
          <dl className="mx-[18px] border-t border-black/[0.07] py-3 dark:border-white/10">
            <RateCardRow label="Already deposited" value={formatMoney("USDC", session.balances.usdc)} />
          </dl>
        ) : null}
        {address ? (
          <div className="mx-[18px] border-t border-black/[0.07] pb-3.5 pt-3 dark:border-white/10">
            <p className="text-black/70 dark:text-white/70">Send USDC on Base to this address to fund your wallet.</p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(address)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => {});
              }}
              aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
              className="mt-2 flex w-full items-center gap-2 rounded-xl bg-[#FDFBF7] px-3 py-2.5 text-left font-mono text-[12px] text-[#141414] outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <span className="min-w-0 flex-1 break-all">{address}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-5">{action}</div>
    </form>
  );
}

/**
 * Moves funds from the trading account back to the wallet that owns it. The venue pays the gas and
 * only ever pays the owner, so there is no address to enter. Mounted only while open.
 */
function WithdrawForm({ session, onSend }: { session: TradeSession | null; onSend: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("USDC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // What the last confirmed withdrawal paid, and where, so the user can see the money arrive.
  const [paid, setPaid] = useState<{ text: string; txHash: string } | null>(null);
  const account = ACCOUNTS.find((candidate) => candidate.currency === currency) ?? ACCOUNTS[0];
  const address = session?.wallet?.address ?? null;

  const value = Number(amount);
  const available = balanceOf(session, currency);
  const exceedsBalance = available !== null && value > available && !isConfirmed;

  function reset() {
    setStatus(null);
    setIsConfirmed(false);
    setPaid(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canTrade(session) || !(value > 0) || exceedsBalance) return;
    const to = shortAddress(session.wallet.address);
    setIsSubmitting(true);
    reset();
    try {
      const outcome = await withdraw({
        amountUnits: parseUnits(amount, TOKEN_DECIMALS),
        currency,
        subaccountId: session.subaccountId,
        wallet: session.wallet,
      });
      if (outcome.kind === "settled") {
        setIsConfirmed(true);
        setPaid({ text: `Sent ${formatMoney(currency, value)} to your wallet ${to}.`, txHash: outcome.txHash });
      } else if (outcome.kind === "pending") {
        setStatus({ tone: "neutral", text: `Withdrawal sent to your wallet ${to}. It can take a minute to arrive.` });
      }
      else setStatus({ tone: "error", text: outcome.reason });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "The withdrawal could not be sent." });
    } finally {
      setIsSubmitting(false);
      session?.refreshBalances();
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  }

  let action: ReactNode;
  if (session === null) {
    action = (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>Withdraw</button>
        <p className={NOTE}>Withdrawals aren&apos;t available yet.</p>
      </>
    );
  } else if (!session.isReady) {
    action = <button type="button" disabled className={PRIMARY_BUTTON}>Loading</button>;
  } else if (!session.isAuthenticated) {
    action = <EmailVerification session={session} />;
  } else if (session.wallet === null) {
    action = <WalletStep session={session} label="Withdraw" />;
  } else if (session.subaccountId === null) {
    action = (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>Withdraw</button>
        <p className={NOTE}>{session.isResolving ? "Finding your trading account" : "You have nothing to withdraw yet."}</p>
      </>
    );
  } else {
    action = (
      <>
        <button
          type="submit"
          disabled={isConfirmed || isSubmitting || !(value > 0) || exceedsBalance}
          className={cn(PRIMARY_BUTTON, "flex items-center justify-center gap-2", isConfirmed && CONFIRMED_BUTTON)}
        >
          {isConfirmed ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Confirmed
            </>
          ) : isSubmitting ? (
            "Withdrawing"
          ) : (
            "Withdraw"
          )}
        </button>
        <p aria-live="polite" className={cn(NOTE, "min-h-5", status?.tone === "error" && ERROR_TEXT)}>
          {paid ? (
            <>
              {paid.text}{" "}
              <a href={`${BASESCAN_TX_URL}${paid.txHash}`} target="_blank" rel="noreferrer" className={LINK}>
                View transaction
              </a>
              {currency === "USDC" ? (
                <>
                  {" · "}
                  <button type="button" onClick={onSend} className={LINK}>
                    Send it on
                  </button>
                </>
              ) : null}
            </>
          ) : (
            (status?.text ?? "")
          )}
        </p>
      </>
    );
  }

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <AmountField
        account={account}
        amount={amount}
        onAmountChange={(next) => {
          setAmount(next);
          reset();
        }}
        caption={exceedsBalance ? "More than your trading account holds" : `Amount in ${account.fiat}`}
        isError={exceedsBalance}
      />

      <div className="mt-5">
        <AccountPicker
          id="withdraw-from"
          label="From"
          account={account}
          session={session}
          onSelect={(next) => {
            setCurrency(next);
            reset();
          }}
        />
      </div>

      {address ? (
        <div className="mt-5 rounded-2xl bg-[#F3EFE9] px-[18px] py-3.5 text-[14px] dark:bg-white/5">
          <dl>
            <RateCardRow label="Paid to your wallet" value={`${address.slice(0, 6)}…${address.slice(-4)}`} />
          </dl>
          <p className="mt-2 text-[13px] text-black/60 dark:text-white/60">
            Withdrawals go to the wallet that owns your trading account, as {account.currency} on Base.
          </p>
        </div>
      ) : null}

      <div className="mt-5">{action}</div>
    </form>
  );
}

/**
 * Sends the wallet's USDC to any address on Base. Gas is sponsored through Privy for the embedded
 * wallet, which holds no ETH; a browser wallet pays its own. Mounted only while open.
 */
function SendForm({ session }: { session: TradeSession | null }) {
  if (session === null) {
    return (
      <div className="mt-5">
        <button type="button" disabled className={PRIMARY_BUTTON}>Send</button>
        <p className={NOTE}>Sending isn&apos;t available yet.</p>
      </div>
    );
  }
  return <SendFormReady session={session} />;
}

function SendFormReady({ session }: { session: TradeSession }) {
  const queryClient = useQueryClient();
  const { sendTransaction } = useSendTransaction();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [sent, setSent] = useState<{ text: string; txHash: string } | null>(null);
  const address = session.wallet?.address ?? null;
  const walletUsdc = useWalletUsdc(address);
  const usdc = ACCOUNTS[0];

  const value = Number(amount);
  const exceedsWallet = walletUsdc !== null && value > walletUsdc && sent === null;
  const problem = recipientProblem(recipient, address);
  const isReadyToSend = value > 0 && !exceedsWallet && recipient.trim() !== "" && problem === null;

  function reset() {
    setStatus(null);
    setSent(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const wallet = session.wallet;
    if (!wallet || !isReadyToSend) return;
    setIsSubmitting(true);
    reset();
    const call = usdcTransfer(recipient, amount);
    const chain = getAppChain();
    try {
      let hash: `0x${string}`;
      if (wallet.walletClientType === "privy") {
        ({ hash } = await sendTransaction(
          { ...call, chainId: chain.id },
          { sponsor: true, address: wallet.address, uiOptions: { showWalletUIs: false } }
        ));
      } else {
        await wallet.switchChain(chain.id);
        const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });
        hash = await walletClient.sendTransaction({ account: wallet.address as `0x${string}`, ...call });
      }
      const succeeded = await waitForTransfer(hash);
      const to = shortAddress(recipient.trim());
      if (succeeded === true) setSent({ text: `Sent ${formatMoney("USDC", value)} to ${to}.`, txHash: hash });
      else if (succeeded === false) setStatus({ tone: "error", text: "The transfer reverted. Nothing was sent." });
      else setSent({ text: `Sending ${formatMoney("USDC", value)} to ${to}. It can take a minute to arrive.`, txHash: hash });
    } catch (error) {
      console.error("[send] the wallet did not send", error);
      const message = error instanceof Error ? error.message.split("\n")[0].replace(/\.$/, "") : "";
      setStatus({
        tone: "error",
        text: message ? `${message}. Nothing was sent.` : "The transfer could not be sent. Nothing was sent.",
      });
    } finally {
      setIsSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc"] });
    }
  }

  let action: ReactNode;
  if (!session.isReady) {
    action = <button type="button" disabled className={PRIMARY_BUTTON}>Loading</button>;
  } else if (!session.isAuthenticated) {
    action = <EmailVerification session={session} />;
  } else if (session.wallet === null) {
    action = <WalletStep session={session} label="Send" />;
  } else {
    const isDone = sent !== null;
    action = (
      <>
        <button
          type="submit"
          disabled={isDone || isSubmitting || !isReadyToSend}
          className={cn(PRIMARY_BUTTON, "flex items-center justify-center gap-2", isDone && CONFIRMED_BUTTON)}
        >
          {isDone ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Confirmed
            </>
          ) : isSubmitting ? (
            "Sending"
          ) : (
            "Send"
          )}
        </button>
        <p aria-live="polite" className={cn(NOTE, "min-h-5", status?.tone === "error" && ERROR_TEXT)}>
          {sent ? (
            <>
              {sent.text}{" "}
              <a href={`${BASESCAN_TX_URL}${sent.txHash}`} target="_blank" rel="noreferrer" className={LINK}>
                View transaction
              </a>
            </>
          ) : (
            (status?.text ?? "")
          )}
        </p>
      </>
    );
  }

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <AmountField
        account={usdc}
        amount={amount}
        onAmountChange={(next) => {
          setAmount(next);
          reset();
        }}
        caption={exceedsWallet ? "More than your wallet holds" : "Amount in USDC"}
        isError={exceedsWallet}
      />

      <label className="mt-5 block">
        <span className={FIELD_LABEL}>To</span>
        <input
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
            reset();
          }}
          placeholder="0x… address on Base"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem !== null}
          aria-describedby="send-recipient-help"
          className={cn(FIELD_PILL, "font-mono text-[14px] text-[#141414] placeholder:font-sans placeholder:text-black/40 dark:text-white dark:placeholder:text-white/40")}
        />
      </label>
      <p id="send-recipient-help" className={cn("mt-2 min-h-5 pl-1 text-[13px]", problem ? ERROR_TEXT : "text-black/60 dark:text-white/60")}>
        {problem ?? "Only send to an address that accepts USDC on Base. Sends can't be reversed."}
      </p>

      <div className="mt-4 rounded-2xl bg-[#F3EFE9] px-[18px] py-3.5 text-[14px] dark:bg-white/5">
        <dl className="space-y-2">
          <RateCardRow label="From your wallet" value={address ? shortAddress(address) : "—"} />
          <RateCardRow label="Available" value={walletUsdc === null ? "—" : formatMoney("USDC", walletUsdc)} />
          <RateCardRow label="Network fee" value={session.wallet?.walletClientType === "privy" ? "Covered by Numo" : "Paid in ETH"} />
        </dl>
      </div>

      <div className="mt-5">{action}</div>
    </form>
  );
}

function TradeDialog({
  title,
  open,
  onOpenChange,
  wide = false,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Room for large amounts beside a token pill: the Exchange dialog. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md" />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ maxWidth: wide ? 580 : 480 }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[32px] bg-[#EDE5DA] p-3 outline-none dark:bg-[#242424]"
        >
          <div className="relative overflow-y-auto overscroll-y-contain rounded-[24px] bg-[#FDFBF7] px-5 pb-7 pt-6 dark:bg-[#1A1A1A] sm:px-8">
            <Dialog.Title className="text-center text-[17px] font-semibold tracking-[-0.01em] text-[#141414] dark:text-white">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="absolute right-[34px] top-6 flex h-7 w-7 items-center justify-center rounded-full text-[#141414]/80 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white/70 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Dialog.Close>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Opens a dialog named by `?action=` (the sidebar's Exchange link), then drops it from the URL. */
function ActionFromUrl({ onOpen }: { onOpen: (kind: DialogKind) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const action = searchParams.get("action");

  useEffect(() => {
    if (action === "exchange" || action === "lock-rate" || action === "deposit" || action === "withdraw" || action === "send") {
      onOpen(action);
      router.replace(pathname);
    }
  }, [action, onOpen, pathname, router]);

  return null;
}

/** The dashboard's "Move money" button: its menu of actions, and the Lock rate and Exchange dialogs. */
export function MoveMoney({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const closeUnless = (kind: DialogKind) => (isOpen: boolean) => setDialog(isOpen ? kind : null);

  return (
    <>
      <Suspense fallback={null}>
        <ActionFromUrl onOpen={setDialog} />
      </Suspense>

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
            {(
              [
                ["lock-rate", "Lock rate"],
                ["exchange", "Exchange"],
                ["deposit", "Deposit"],
                ["withdraw", "Withdraw"],
                ["send", "Send"],
              ] as const
            ).map(([kind, label]) => (
              <DropdownMenu.Item
                key={kind}
                onSelect={() => setDialog(kind)}
                className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
              >
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <TradeDialog title="Lock rate" open={dialog === "lock-rate"} onOpenChange={closeUnless("lock-rate")}>
        <WithTradeSession>{(session) => <LockRateForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Exchange" wide open={dialog === "exchange"} onOpenChange={closeUnless("exchange")}>
        <WithTradeSession>{(session) => <ExchangeForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Deposit" open={dialog === "deposit"} onOpenChange={closeUnless("deposit")}>
        <WithTradeSession>{(session) => <DepositForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Withdraw" open={dialog === "withdraw"} onOpenChange={closeUnless("withdraw")}>
        <WithTradeSession>{(session) => <WithdrawForm session={session} onSend={() => setDialog("send")} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Send" open={dialog === "send"} onOpenChange={closeUnless("send")}>
        <WithTradeSession>{(session) => <SendForm session={session} />}</WithTradeSession>
      </TradeDialog>
    </>
  );
}
