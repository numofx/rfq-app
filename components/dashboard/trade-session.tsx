"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { useTradingConfigured } from "@/components/privy-provider";
import { useAccountUser } from "@/lib/hooks/useAccountUser";
import { useTradingAccount, useTradingWallet, type TradingBalances, type WalletStatus } from "@/lib/hooks/useTrading";
import { TERMINAL_URL } from "@/lib/venue/config";
import { cn } from "@/lib/utils";

/** Everything a dialog needs to trade: the wallet, its trading account, and how to sign in to it. */
export type TradeSession = {
  isReady: boolean;
  isAuthenticated: boolean;
  wallet: ConnectedWallet | null;
  walletStatus: WalletStatus;
  /** The wallet the Privy account logged in with, which the trading app trades from. */
  accountWalletAddress: string | null;
  connectWallet: () => void;
  createWallet: () => Promise<unknown>;
  subaccountId: string | null;
  isResolving: boolean;
  lookupFailed: boolean;
  balances: TradingBalances | null;
  refreshBalances: () => void;
  commandEmail: string | null;
  otpStatus: string;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
};

function SessionProvider({ children }: { children: (session: TradeSession) => ReactNode }) {
  const user = useAccountUser();
  const trading = useTradingWallet();
  const account = useTradingAccount(trading.wallet?.address ?? null);

  return children({
    isReady: trading.isReady,
    isAuthenticated: trading.isAuthenticated,
    wallet: trading.wallet,
    walletStatus: trading.walletStatus,
    accountWalletAddress: trading.accountWalletAddress,
    connectWallet: trading.connectWallet,
    createWallet: trading.createWallet,
    subaccountId: account.subaccountId,
    isResolving: account.isResolving,
    lookupFailed: account.lookupFailed,
    balances: account.balances,
    refreshBalances: account.refreshBalances,
    commandEmail: user?.email || null,
    otpStatus: trading.otpState.status,
    sendCode: (email) => trading.sendCode({ email, disableSignup: false }),
    loginWithCode: (code) => trading.loginWithCode({ code }),
  });
}

/** Renders with the trading session, or with null where no Privy app is configured. */
export function WithTradeSession({ children }: { children: (session: TradeSession | null) => ReactNode }) {
  const isConfigured = useTradingConfigured();
  return isConfigured ? <SessionProvider>{children}</SessionProvider> : <>{children(null)}</>;
}

/** True once the session can sign an order from a trading account. */
export function canTrade(session: TradeSession | null): session is TradeSession & { wallet: ConnectedWallet; subaccountId: string } {
  return session !== null && session.isAuthenticated && session.wallet !== null && session.subaccountId !== null;
}

const PRIMARY_BUTTON =
  "h-[50px] w-full rounded-full bg-[#141414] text-[16px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#E5DDD0] disabled:text-black/55 dark:bg-white dark:text-[#141414] dark:disabled:bg-white/10 dark:disabled:text-white/40";
const NOTE = "mt-3 text-center text-[13px] text-black/60 dark:text-white/60";

/** How long a wallet may load before the dialog says it is stuck rather than loading. */
const WALLET_STALL_MS = 10_000;

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * What stands between a verified user and a usable wallet: it is loading, it is a browser wallet
 * that has to be connected here, or the account has none yet. Rendered while `session.wallet` is null.
 */
export function WalletStep({ session, label }: { session: TradeSession; label: string }) {
  const [isStalled, setIsStalled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.walletStatus !== "loading") return;
    const timer = setTimeout(() => setIsStalled(true), WALLET_STALL_MS);
    return () => clearTimeout(timer);
  }, [session.walletStatus]);

  if (session.walletStatus === "connect") {
    const address = session.accountWalletAddress;
    return (
      <>
        <button type="button" className={PRIMARY_BUTTON} onClick={session.connectWallet}>
          Connect wallet
        </button>
        <p className={NOTE}>
          {address
            ? `Your trading account belongs to ${shortAddress(address)}. Connect that wallet to continue.`
            : "Connect the wallet you trade with on Numo to continue."}
        </p>
      </>
    );
  }

  if (session.walletStatus === "create") {
    return (
      <>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          onClick={() => {
            setError("");
            session.createWallet().catch(() => setError("We couldn't create your wallet. Try again."));
          }}
        >
          Create wallet
        </button>
        <p className={cn(NOTE, error && "text-[#B4412F] dark:text-[#E98A7A]")}>
          {error || "Your account has no wallet yet. Create one to hold your funds."}
        </p>
      </>
    );
  }

  return (
    <>
      <button type="button" disabled className={PRIMARY_BUTTON}>{label}</button>
      <p className={NOTE}>
        {isStalled
          ? "Your wallet didn't load. Refresh the page, and if it persists, contact support."
          : "Loading your wallet"}
      </p>
    </>
  );
}

/** Verifies the command login's email with Privy, which opens the same wallet as the trading app. */
export function EmailVerification({ session }: { session: TradeSession }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  // Set only once a code has gone out, so a failed send stays on the send step.
  const [isCodeSent, setIsCodeSent] = useState(false);
  const email = session.commandEmail;
  const isAwaitingCode = isCodeSent;
  const isBusy = session.otpStatus === "sending-code" || session.otpStatus === "submitting-code";

  if (!email) {
    return <p className={NOTE}>Loading your account</p>;
  }

  if (!isAwaitingCode) {
    return (
      <>
        <button
          type="button"
          disabled={isBusy}
          className={PRIMARY_BUTTON}
          onClick={() => {
            setError("");
            session
              .sendCode(email)
              .then(() => setIsCodeSent(true))
              .catch(() => setError("We couldn't send a code. Try again."));
          }}
        >
          {isBusy ? "Sending code" : "Verify email to trade"}
        </button>
        <p className={cn(NOTE, error && "text-[#B4412F] dark:text-[#E98A7A]")} aria-live="polite">
          {error || `We'll send a code to ${email} to open your trading wallet.`}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          autoFocus
          aria-label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-[50px] min-w-0 flex-1 rounded-full bg-[#EFE7DC] px-5 font-mono text-[16px] tracking-[0.2em] text-[#141414] outline-none placeholder:tracking-normal placeholder:text-black/40 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
        />
        <button
          type="button"
          disabled={code.length !== 6 || isBusy}
          className={cn(PRIMARY_BUTTON, "w-auto px-6")}
          onClick={() => {
            setError("");
            session.loginWithCode(code).catch(() => setError("That code didn't work. Check it and try again."));
          }}
        >
          {session.otpStatus === "submitting-code" ? "Verifying" : "Verify"}
        </button>
      </div>
      <p className={cn(NOTE, error && "text-[#B4412F] dark:text-[#E98A7A]")} aria-live="polite">
        {error || `Enter the code we sent to ${email}.`}
      </p>
    </>
  );
}

/**
 * The dialog's action: the submit button once the session can trade, or the step that stands in
 * the way. `status` is the outcome of the last order, shown under the button.
 */
export function TradeAction({
  session,
  label,
  disabledReason,
  isSubmitting,
  status,
}: {
  session: TradeSession | null;
  label: string;
  /** Why the order can't be placed as entered; null when it can. */
  disabledReason: string | null;
  isSubmitting: boolean;
  status: { tone: "neutral" | "error"; text: string } | null;
}) {
  if (session === null) {
    return (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>{label}</button>
        <p className={NOTE}>Trading isn&apos;t available yet.</p>
      </>
    );
  }
  if (!session.isReady) {
    return <button type="button" disabled className={PRIMARY_BUTTON}>Loading</button>;
  }
  if (!session.isAuthenticated) {
    return <EmailVerification session={session} />;
  }
  if (session.wallet === null) {
    return <WalletStep session={session} label={label} />;
  }
  if (session.isResolving) {
    return (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>{label}</button>
        <p className={NOTE}>Finding your trading account</p>
      </>
    );
  }
  if (session.subaccountId === null) {
    return (
      <>
        <button type="button" disabled className={PRIMARY_BUTTON}>{label}</button>
        <p className={NOTE}>
          {session.lookupFailed ? (
            "We couldn't read your trading account. Try again shortly."
          ) : (
            <>
              You don&apos;t have a trading account yet.{" "}
              <a href={TERMINAL_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[#141414] underline underline-offset-2 dark:text-white">
                Deposit in the Numo terminal
              </a>{" "}
              to open one.
            </>
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <button type="submit" disabled={disabledReason !== null || isSubmitting} className={PRIMARY_BUTTON}>
        {isSubmitting ? "Placing order" : label}
      </button>
      <p
        aria-live="polite"
        className={cn(NOTE, "min-h-5", status?.tone === "error" && "text-[#B4412F] dark:text-[#E98A7A]")}
      >
        {status?.text ?? disabledReason ?? ""}
      </p>
    </>
  );
}

/**
 * The trading account's balances, `"none"` once the lookup has found no account, or null while
 * they are unknown: not verified in this browser yet, or still loading.
 */
export function accountHoldings(session: TradeSession | null): TradingBalances | "none" | null {
  if (!session?.isAuthenticated || session.wallet === null || session.isResolving) return null;
  if (session.subaccountId === null) return session.lookupFailed ? null : "none";
  return session.balances;
}
