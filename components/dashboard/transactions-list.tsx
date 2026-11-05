"use client";

import { format } from "date-fns";
import { Activity, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Lock } from "lucide-react";
import type { ElementType } from "react";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
import { accountHoldings, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { TransactionsEmpty } from "@/components/dashboard/transactions-empty";
import { useTransactions } from "@/lib/hooks/useTrading";
import type { Transaction, TransactionKind } from "@/lib/venue/transactions";

const BASESCAN_TX_URL = "https://basescan.org/tx/";

const KINDS: Record<TransactionKind, { icon: ElementType; title: (tx: Transaction) => string }> = {
  deposit: { icon: ArrowDownLeft, title: (tx) => `Deposited ${tx.cngn > 0 ? "cNGN" : "USDC"}` },
  withdrawal: { icon: ArrowUpRight, title: (tx) => `Withdrew ${tx.cngn < 0 ? "cNGN" : "USDC"}` },
  buy: { icon: ArrowRightLeft, title: () => "Bought cNGN" },
  sell: { icon: ArrowRightLeft, title: () => "Sold cNGN" },
  lock: { icon: Lock, title: () => "Locked rate" },
  settlement: { icon: Activity, title: () => "Futures settlement" },
  other: { icon: Activity, title: () => "Other activity" },
};

function formatAmount(value: number, currency: "USDC" | "cNGN") {
  const sign = value < 0 ? "−" : "+";
  const digits = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currency === "USDC" ? "$" : "₦"}${digits}`;
}

/** The main figure, then the other side of it, so a row reads like a statement line. */
function amounts(tx: Transaction): [string, string | null] {
  const usdc = Math.abs(tx.usdc) >= 0.005 ? formatAmount(tx.usdc, "USDC") : null;
  const cngn = Math.abs(tx.cngn) >= 0.005 ? formatAmount(tx.cngn, "cNGN") : null;
  if (tx.kind === "lock") {
    const side = tx.futureCngn > 0 ? "long" : "short";
    const notional = Math.abs(tx.futureCngn).toLocaleString("en-US", { maximumFractionDigits: 0 });
    return [`₦${notional} ${side}`, usdc];
  }
  if (tx.kind === "buy") return [cngn ?? "", usdc];
  if (tx.kind === "sell") return [usdc ?? "", cngn];
  return [usdc ?? cngn ?? "", usdc && cngn ? cngn : null];
}

function Row({ tx }: { tx: Transaction }) {
  const { icon: Icon, title } = KINDS[tx.kind];
  const [primary, secondary] = amounts(tx);
  return (
    <li>
      <a
        href={`${BASESCAN_TX_URL}${tx.hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-black/[0.02] focus-visible:bg-black/[0.03] dark:hover:bg-white/5 sm:px-6"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3EFE9] text-[#141414] dark:bg-white/5 dark:text-white">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-[#141414] dark:text-white">{title(tx)}</span>
          <span className="block text-[13px] text-black/55 dark:text-white/60">{format(tx.time, "MMM d, h:mm a")}</span>
        </span>
        <span className="shrink-0 text-right font-mono">
          <span className="block text-[14px] text-[#141414] dark:text-white">{primary}</span>
          {secondary ? <span className="block text-[13px] text-black/55 dark:text-white/60">{secondary}</span> : null}
        </span>
      </a>
    </li>
  );
}

function Note({ children }: { children: string }) {
  return (
    <div className={`mt-4 ${PANEL_TRAY}`}>
      <div className={`${PANEL_CARD} px-6 py-10 text-center text-[14px] text-black/55 dark:text-white/60`}>{children}</div>
    </div>
  );
}

function List({ session, limit }: { session: TradeSession | null; limit?: number }) {
  const holdings = accountHoldings(session);
  const subaccountId = holdings !== null && holdings !== "none" ? (session?.subaccountId ?? null) : null;
  const { transactions, isLoading, isError } = useTransactions(subaccountId, session?.wallet?.address ?? null);

  if (holdings === "none") return <TransactionsEmpty />;
  if (session !== null && session.isReady && !session.isAuthenticated) {
    return <Note>Open Add funds and verify your email to see your transactions.</Note>;
  }
  if (holdings === null || isLoading) return <Note>Loading your transactions</Note>;
  if (isError || transactions === null) return <Note>Your transactions couldn&apos;t be loaded. Try again shortly.</Note>;
  if (transactions.length === 0) return <TransactionsEmpty />;

  return (
    <div className={`mt-4 ${PANEL_TRAY}`}>
      <ul className={`${PANEL_CARD} divide-y divide-black/[0.06] overflow-hidden dark:divide-white/10`}>
        {(limit ? transactions.slice(0, limit) : transactions).map((tx) => (
          <Row key={tx.hash} tx={tx} />
        ))}
      </ul>
    </div>
  );
}

/** The trading account's deposits, exchanges, rate locks and withdrawals, newest first, read from Base. */
export function TransactionsList({ limit }: { limit?: number }) {
  return <WithTradeSession>{(session) => <List session={session} limit={limit} />}</WithTradeSession>;
}
