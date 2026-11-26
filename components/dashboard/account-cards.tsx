import { ChevronRight } from "lucide-react";
import { formatUnits } from "viem";
import { CurrencyIcon } from "@/components/dashboard/currency-icon";
import { accountHoldings, WithTradeSession, type TradeSession } from "@/components/dashboard/trade-session";
import { useUsdPerCngn } from "@/lib/hooks/useExchangeRate";
import { useWalletTokens, WALLET_DUST } from "@/lib/hooks/useWalletTokens";
import { EXCHANGE_TOKENS } from "@/lib/zeroex";

export const ACCOUNTS = [
  { iconSrc: "/tokens/usdc.svg", flagSrc: "/flags/us.svg", currency: "USDC", fiat: "USD", name: "US Dollar", symbol: "$", balance: "0.00" },
  { iconSrc: "/tokens/cngn.png", flagSrc: "/flags/ng.svg", currency: "cNGN", fiat: "NGN", name: "Nigerian Naira", symbol: "₦", balance: "0.00" },
] as const;

const formatBalance = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CARD = "flex items-center gap-4 rounded-[20px] bg-[#FDFBF7] p-5 ring-1 ring-inset ring-black/[0.06] dark:bg-[#1A1A1A] dark:ring-white/[0.08]";

export function AccountCards() {
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">Accounts</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WithTradeSession>{(session) => <Cards session={session} />}</WithTradeSession>
      </div>
    </section>
  );
}

function Cards({ session }: { session: TradeSession | null }) {
  const holdings = accountHoldings(session);
  const walletTokens = useWalletTokens(session?.wallet?.address ?? null);
  const usdPerCngn = useUsdPerCngn();

  return ACCOUNTS.map(({ currency, name, symbol, balance, ...account }) => {
    const held = holdings === null || holdings === "none" ? null : currency === "USDC" ? holdings.usdc : holdings.cngn;
    const amount = holdings === "none" ? balance : held === null ? "—" : formatBalance(held);
    const inWallet = walletTokens !== null && walletTokens[currency] >= WALLET_DUST[currency] ? walletTokens[currency] : null;

    // One line under the balance: money waiting in the wallet first, else naira's dollar value at the 0x rate.
    let note = "";
    if (inWallet !== null) note = `+ ${formatBalance(Number(formatUnits(inWallet, EXCHANGE_TOKENS[currency].decimals)))} in your wallet`;
    else if (currency === "cNGN" && held !== null && held > 0 && usdPerCngn !== null) note = `≈ $${formatBalance(held * usdPerCngn)}`;

    return (
      <div key={currency} className={CARD}>
        <CurrencyIcon account={account} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-black/60 dark:text-white/60">{name}</p>
          <p className="mt-0.5 truncate font-mono text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#141414] dark:text-white">
            {symbol}
            {amount}
          </p>
          <p className="mt-0.5 h-[18px] truncate text-[13px] text-black/60 dark:text-white/60">{note}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-black/40 dark:text-white/50" strokeWidth={1.75} aria-hidden="true" />
      </div>
    );
  });
}
