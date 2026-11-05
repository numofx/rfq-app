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

/**
 * Keeps the trading wallet's session tied to the command login. Privy keeps its own session in
 * localStorage, which outlives a Supabase sign-out, so a second person on the same browser would
 * otherwise trade from the first person's wallet.
 */
function TradingSessionGuard() {
  const { authenticated, logout, ready, user } = usePrivy();
  const privyEmail = user?.email?.address?.toLowerCase() ?? null;

  useEffect(() => {
    const client = supabase;
    if (!ready || !authenticated || !client) return;

    let isMounted = true;
    void client.auth.getUser().then(({ data }) => {
      const commandEmail = data.user?.email?.toLowerCase() ?? null;
      if (isMounted && commandEmail !== privyEmail) {
        void logout();
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void logout();
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [authenticated, logout, privyEmail, ready]);

  return null;
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
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </TradingConfiguredContext.Provider>
    </PrivyProvider>
  );
}
