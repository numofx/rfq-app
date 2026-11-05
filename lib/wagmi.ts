import { http } from "wagmi";
import { base } from "viem/chains";
import { createConfig } from "@privy-io/wagmi";

// createConfig comes from @privy-io/wagmi, not wagmi, so wagmi sees Privy's embedded wallet.
// Base only: it is the chain the venue settles on, and the one Privy is pinned to.
export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || undefined),
  },
});
