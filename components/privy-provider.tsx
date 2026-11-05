"use client";

import { createContext, useContext, useEffect } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { base } from "viem/chains";
import { config } from "@/lib/wagmi";
import { supabase } from "@/lib/supabase/client";

const TradingConfiguredContext = createContext(false);

/** False when no Privy app is configured: nothing that calls Privy's hooks may render then. */
export function useTradingConfigured() {
  return useContext(TradingConfiguredContext);
}

const LockWalletContext = createContext<() => Promise<void>>(async () => {});

/**
 * Logs out of command and locks the trading wallet. Command's own session also ends whenever the
 * page is left, which keeps the wallet open so the next login needs no code; this is the
 * deliberate Log out, which closes both.
 */
export function useSignOut() {
  const lockWallet = useContext(LockWalletContext);
  return async () => {
    await lockWallet().catch(() => {});
    await supabase?.auth.signOut();
  };
}

/**
 * Closes the trading wallet when a different email logs in to command, so a second person on the
 * same browser never trades from the first person's wallet.
 */
function TradingSessionGuard() {
  const { authenticated, logout, ready, user } = usePrivy();
  const privyEmail = user?.email?.address?.toLowerCase() ?? null;

  useEffect(() => {
    const client = supabase;
    if (!ready || !authenticated || !client) return;

    function check(commandEmail: string | null | undefined) {
      if (commandEmail && commandEmail.toLowerCase() !== privyEmail) void logout();
    }

    void client.auth.getUser().then(({ data }) => check(data.user?.email));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => check(session?.user?.email));
    return () => listener.subscription.unsubscribe();
  }, [authenticated, logout, privyEmail, ready]);

  return null;
}

function LockWalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, logout } = usePrivy();
  return (
    <LockWalletContext.Provider value={async () => (authenticated ? logout() : undefined)}>
      {children}
    </LockWalletContext.Provider>
  );
}

/**
 * The trading app's Privy app, so a command user signs with the same embedded wallet, and trades
 * the same subaccount, as on app.numofx.com.
 */
export function PrivyWagmiProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim();

  if (!appId) {
    return <WagmiProvider config={config}>{children}</WagmiProvider>;
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        appearance: { theme: "light", logo: "/numo.png" },
        defaultChain: base,
        supportedChains: [base],
        loginMethods: ["email"],
        embeddedWallets: {
          // Orders are signed inside the Lock rate and Exchange dialogs, without Privy's modal.
          showWalletUIs: false,
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <TradingConfiguredContext.Provider value>
        <TradingSessionGuard />
        <LockWalletProvider>
          <WagmiProvider config={config}>{children}</WagmiProvider>
        </LockWalletProvider>
      </TradingConfiguredContext.Provider>
    </PrivyProvider>
  );
}
