import { useQuery } from "@tanstack/react-query";
import { getAddress, parseAbi } from "viem";
import { createBasePublicClient } from "@/lib/venue/config";
import { EXCHANGE_TOKENS, type ExchangeCurrency } from "@/lib/zeroex";

const balanceOfAbi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const POLL_MS = 15_000;

/**
 * The wallet's own USDC and cNGN on Base, in base units: money outside the trading account, such as an
 * exchange that stopped between its steps. Null until read.
 */
export function useWalletTokens(walletAddress: string | null): Record<ExchangeCurrency, bigint> | null {
  const { data } = useQuery({
    queryKey: ["wallet-tokens", walletAddress],
    queryFn: async () => {
      const client = createBasePublicClient();
      const owner = getAddress(walletAddress as string);
      const [usdc, cngn] = await Promise.all(
        (["USDC", "cNGN"] as const).map((currency) =>
          client.readContract({ abi: balanceOfAbi, address: EXCHANGE_TOKENS[currency].address, functionName: "balanceOf", args: [owner] })
        )
      );
      return { USDC: usdc, cNGN: cngn };
    },
    enabled: walletAddress !== null,
    refetchInterval: POLL_MS,
    retry: 1,
  });
  return data ?? null;
}
