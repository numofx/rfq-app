"use client";

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calendar, Check, ChevronDown, Copy, X } from "lucide-react";
import { ACCOUNTS } from "@/components/dashboard/account-cards";
import { canTrade, CONFIRMED_BUTTON, EmailVerification, TradeAction, WalletStep, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { INITIAL_MARGIN_RATE, quoteForward, type ForwardQuote } from "@/lib/forward-quote";
import { useForwardBook } from "@/lib/hooks/useForwardRate";
import { useVenueMarket, useWalletUsdc } from "@/lib/hooks/useTrading";
import { depositUsdc, MIN_DEPOSIT_USDC } from "@/lib/venue/deposit";
import { TOKEN_DECIMALS, withdraw } from "@/lib/venue/withdraw";
import { parseUnits } from "viem";
import { FUTURE_SYMBOL, SPOT_SYMBOL, type VenueMarket } from "@/lib/venue/market";
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
const SOON_ACTIONS = ["Direct", "Request", "Transfer"];

type Currency = "USDC" | "cNGN";
type Account = (typeof ACCOUNTS)[number];
type Status = { tone: "neutral" | "error"; text: string } | null;
type DialogKind = "lock-rate" | "exchange" | "deposit" | "withdraw";

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
            <Image src={account.iconSrc} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 rounded-full object-cover" />
            <span id={`${id}-value`} className="min-w-0 text-left text-[14px] font-medium leading-tight text-[#141414] dark:text-white">
              <span className="block">{account.currency}</span>
              <span className={cn(AVAILABLE, "block truncate text-[12px] font-normal")}>
                {formatAvailable(account.currency as Currency, account.symbol)} avail.
              </span>
            </span>
            <ChevronDown className={FIELD_CHEVRON} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className={cn(MENU_CONTENT, "min-w-[var(--radix-dropdown-menu-trigger-width)]")}>
            {ACCOUNTS.map(({ iconSrc, currency, symbol }) => (
              <DropdownMenu.Item
                key={currency}
                onSelect={() => onSelect(currency as Currency)}
                className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <Image src={iconSrc} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-full object-cover" />
                  {currency}
                </span>
                <span className={cn(AVAILABLE, "text-[13px]")}>{formatAvailable(currency as Currency, symbol)} available</span>
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
        caption={isShortOfMargin && !isConfirmed ? "Not enough margin for this amount" : `Amount in ${account.currency}`}
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

/** Converts between the accounts at the spot rate: a market order on cNGN-USDC. Mounted only while open. */
function ExchangeForm({ session }: { session: TradeSession | null }) {
  const [amount, setAmount] = useState("");
  const [fromCode, setFromCode] = useState<Currency>("USDC");
  const from = ACCOUNTS.find(({ currency }) => currency === fromCode) ?? ACCOUNTS[0];
  const toCode = otherCurrency(fromCode);
  const { market, isPending } = useVenueMarket(SPOT_SYMBOL);
  const { isConfirmed, isSubmitting, status, reset, submit } = useOrderSubmission(session);

  const value = Number(amount);
  const plan = market && value > 0 ? planOrder(market, fromCode, value) : null;
  const available = balanceOf(session, fromCode);
  const exceedsBalance = available !== null && value > available;
  const receive =
    plan && typeof plan !== "string" ? (toCode === "cNGN" ? plan.cngn : plan.notionalUsdc - plan.feeUsdc) : null;
  // The spot book is quoted in USDC per cNGN; command shows rates as cNGN per USDC.
  const bestPrice = market ? (fromCode === "USDC" ? market.asks[0]?.price : market.bids[0]?.price) : undefined;
  const rate = plan && typeof plan !== "string" ? 1 / plan.expectedPrice : bestPrice ? 1 / bestPrice : null;

  let disabledReason: string | null = null;
  if (!(value > 0)) disabledReason = "";
  else if (exceedsBalance) disabledReason = "";
  else if (plan === null) disabledReason = isPending ? "Loading the market" : "The market is unavailable";
  else if (typeof plan === "string") disabledReason = plan;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabledReason !== null || !market || !plan || typeof plan === "string") return;
    const verb = plan.side === "buy" ? "Bought" : "Sold";
    void submit(market, plan, (cngn) => `${verb} ₦${formatNumber(cngn)}.`);
  }

  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <AmountField
        account={from}
        amount={amount}
        onAmountChange={(next) => {
          setAmount(next);
          reset();
        }}
        caption={exceedsBalance && !isConfirmed ? "Exceeds your available balance" : `Amount in ${from.currency}`}
        isError={exceedsBalance && !isConfirmed}
      />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <AccountPicker id="exchange-from" label="From" account={from} session={session} onSelect={setFromCode} />
        <AccountPicker id="exchange-to" label="To" account={ACCOUNTS.find(({ currency }) => currency === toCode) ?? ACCOUNTS[1]} session={session} onSelect={(currency) => setFromCode(otherCurrency(currency))} />
      </div>

      <div className="mt-5 rounded-2xl bg-[#F3EFE9] text-[14px] dark:bg-white/5">
        <div className="flex items-baseline justify-between gap-4 px-[18px] py-3.5">
          <p className="min-w-0 font-medium text-[#141414] dark:text-white">
            Rate <span className="text-[13px] font-normal text-black/60 dark:text-white/60">{rate === null ? (isPending ? "Loading" : "Unavailable") : "cNGN per USDC"}</span>
          </p>
          <p className={cn("shrink-0 font-mono text-[20px] font-semibold leading-none", rate === null ? "text-black/25 dark:text-white/30" : "text-[#141414] dark:text-white")}>
            {rate === null ? "—" : formatNumber(rate)}
          </p>
        </div>
        {plan && typeof plan !== "string" && receive !== null ? (
          <dl className="mx-[18px] space-y-2 border-t border-black/[0.07] pb-3 pt-3 dark:border-white/10">
            <RateCardRow label="You get" value={`≈ ${formatMoney(toCode, receive)}`} />
            <RateCardRow label="Fee" hint={formatPercent(market ? market.takerFeeBps / 10_000 : 0)} value={formatMoney("USDC", plan.feeUsdc)} />
          </dl>
        ) : null}
      </div>

      <div className="mt-5">
        <TradeAction session={session} label="Exchange" disabledReason={disabledReason} isSubmitting={isSubmitting} isConfirmed={isConfirmed} status={status} />
      </div>
    </form>
  );
}

const PRIMARY_BUTTON =
  "h-[50px] w-full rounded-full bg-[#141414] text-[16px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5DDD0] disabled:text-black/55 dark:bg-white dark:text-[#141414] dark:disabled:bg-white/10 dark:disabled:text-white/40";
const NOTE = "mt-3 text-center text-[13px] text-black/60 dark:text-white/60";

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
function WithdrawForm({ session }: { session: TradeSession | null }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("USDC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const account = ACCOUNTS.find((candidate) => candidate.currency === currency) ?? ACCOUNTS[0];
  const address = session?.wallet?.address ?? null;

  const value = Number(amount);
  const available = balanceOf(session, currency);
  const exceedsBalance = available !== null && value > available && !isConfirmed;

  function reset() {
    setStatus(null);
    setIsConfirmed(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canTrade(session) || !(value > 0) || exceedsBalance) return;
    setIsSubmitting(true);
    reset();
    try {
      const outcome = await withdraw({
        amountUnits: parseUnits(amount, TOKEN_DECIMALS),
        currency,
        subaccountId: session.subaccountId,
        wallet: session.wallet,
      });
      if (outcome.kind === "settled") setIsConfirmed(true);
      else if (outcome.kind === "pending") setStatus({ tone: "neutral", text: "Withdrawal sent. It can take a minute to reach your wallet." });
      else setStatus({ tone: "error", text: outcome.reason });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "The withdrawal could not be sent." });
    } finally {
      setIsSubmitting(false);
      session?.refreshBalances();
      void queryClient.invalidateQueries({ queryKey: ["wallet-usdc"] });
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
          {isConfirmed ? "" : (status?.text ?? "")}
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
        caption={exceedsBalance ? "More than your trading account holds" : `Amount in ${account.currency}`}
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

function TradeDialog({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[32px] bg-[#EDE5DA] p-3 outline-none dark:bg-[#242424]"
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
    if (action === "exchange" || action === "lock-rate" || action === "deposit" || action === "withdraw") {
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

      <TradeDialog title="Lock rate" open={dialog === "lock-rate"} onOpenChange={closeUnless("lock-rate")}>
        <WithTradeSession>{(session) => <LockRateForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Exchange" open={dialog === "exchange"} onOpenChange={closeUnless("exchange")}>
        <WithTradeSession>{(session) => <ExchangeForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Deposit" open={dialog === "deposit"} onOpenChange={closeUnless("deposit")}>
        <WithTradeSession>{(session) => <DepositForm session={session} />}</WithTradeSession>
      </TradeDialog>
      <TradeDialog title="Withdraw" open={dialog === "withdraw"} onOpenChange={closeUnless("withdraw")}>
        <WithTradeSession>{(session) => <WithdrawForm session={session} />}</WithTradeSession>
      </TradeDialog>
    </>
  );
}
