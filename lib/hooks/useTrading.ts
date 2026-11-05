"use client";

import { useConnectWallet, useCreateWallet, useLoginWithEmail, usePrivy, useWallets } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { CNGN_ASSET, TRADING_MANAGER_ADDRESS, USDC_CASH_ASSET } from "@/lib/venue/config";
import { readWalletUsdc } from "@/lib/venue/deposit";
import type { VenueMarket, VenueSymbol } from "@/lib/venue/market";
import { findTradingSubaccountId, LEDGER_DECIMALS, readLedgerBalances } from "@/lib/venue/subaccount";

const MARKET_POLL_MS = 5000;
const BALANCE_POLL_MS = 15_000;

/**
 * Where the trading wallet stands: connected, still loading, linked to the account but not connected
 * in this browser (a browser wallet such as MetaMask), or missing.
 */
export type WalletStatus = "loading" | "ready" | "connect" | "create";

/** Only call from inside a component rendered when useTradingConfigured() is true. */
export function useTradingWallet() {
  const { authenticated, ready, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { loginWithCode, sendCode, state } = useLoginWithEmail();
  const { connectWallet } = useConnectWallet();
  const { createWallet } = useCreateWallet();

  // The wallet the account logged in with first, as trading-app's resolvePrimaryWallet does, so
  // both apps trade from the same wallet and so the same subaccount.
  const accountWallet = user?.wallet ?? null;
  const accountAddress = accountWallet?.address?.toLowerCase() ?? null;
  const wallet =
    (accountAddress ? wallets.find((candidate) => candidate.address.toLowerCase() === accountAddress) : undefined) ??
    wallets.find((candidate) => candidate.walletClientType === "privy") ??
    null;

  let walletStatus: WalletStatus = "loading";
  if (wallet) walletStatus = "ready";
  else if (ready && walletsReady && accountWallet === null) walletStatus = "create";
  else if (ready && walletsReady && accountWallet?.walletClientType !== "privy") walletStatus = "connect";

  return {
    isReady: ready && (!authenticated || walletsReady),
    isAuthenticated: authenticated,
    privyEmail: user?.email?.address ?? null,
    wallet,
    walletStatus,
    accountWalletAddress: accountWallet?.address ?? null,
    connectWallet: () => connectWallet(accountWallet ? { suggestedAddress: accountWallet.address } : undefined),
    createWallet: () => createWallet(),
    loginWithCode,
    sendCode,
    otpState: state,
  };
}

/** A market's order parameters and book. Null while loading or after a failed read. */
export function useVenueMarket(symbol: VenueSymbol) {
  const { data, isError, isPending } = useQuery({
    queryKey: ["venue-market", symbol],
    queryFn: async (): Promise<VenueMarket> => {
      const response = await fetch(`/api/venue/market?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`market responded ${response.status}`);
      return (await response.json()) as VenueMarket;
    },
    staleTime: 0,
    refetchInterval: MARKET_POLL_MS,
    retry: 1,
  });
  return { market: isError ? null : (data ?? null), isPending };
}

/** The wallet's own USDC on Base, before it is deposited. Null while loading or after a failed read. */
export function useWalletUsdc(walletAddress: string | null) {
  const { data } = useQuery({
    queryKey: ["wallet-usdc", walletAddress],
    queryFn: () => readWalletUsdc(walletAddress as string),
    enabled: walletAddress !== null,
    refetchInterval: BALANCE_POLL_MS,
    retry: 1,
  });
  return data ?? null;
}

export type TradingBalances = { usdc: number; cngn: number; imSurplusUsd: number | null };

/**
 * The wallet's trading subaccount and what it holds. `subaccountId` is null once the lookup has
 * finished and found none; `isResolving` is true until then.
 */
export function useTradingAccount(walletAddress: string | null) {
  const subaccount = useQuery({
    queryKey: ["trading-subaccount", walletAddress],
    queryFn: () => findTradingSubaccountId(walletAddress as string, TRADING_MANAGER_ADDRESS),
    enabled: walletAddress !== null,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const subaccountId = subaccount.data ?? null;

  const balances = useQuery({
    queryKey: ["trading-balances", subaccountId],
    queryFn: async (): Promise<TradingBalances> => {
      const [balanceOf, margin] = await Promise.all([
        readLedgerBalances(subaccountId as string),
        fetch(`/api/venue/account?subaccount_id=${subaccountId}`, { cache: "no-store" })
          .then((response) => (response.ok ? (response.json() as Promise<{ imSurplusUsd: number | null }>) : null))
          .catch(() => null),
      ]);
      return {
        usdc: Number(formatUnits(balanceOf(USDC_CASH_ASSET), LEDGER_DECIMALS)),
        cngn: Number(formatUnits(balanceOf(CNGN_ASSET), LEDGER_DECIMALS)),
        imSurplusUsd: margin?.imSurplusUsd ?? null,
      };
    },
    enabled: subaccountId !== null,
    refetchInterval: BALANCE_POLL_MS,
    retry: 1,
  });

  return {
    subaccountId,
    isResolving: walletAddress !== null && subaccount.isPending,
    lookupFailed: subaccount.isError,
    balances: balances.data ?? null,
    refreshBalances: () => void balances.refetch(),
  };
}
