import { ChevronRight } from "lucide-react";
import { CurrencyIcon } from "@/components/dashboard/currency-icon";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
import { accountHoldings, WithTradeSession } from "@/components/dashboard/trade-session";

export const ACCOUNTS = [
  { iconSrc: "/tokens/usdc.svg", flagSrc: "/flags/us.svg", currency: "USDC", fiat: "USD", symbol: "$", balance: "0.00" },
  { iconSrc: "/tokens/cngn.png", flagSrc: "/flags/ng.svg", currency: "cNGN", fiat: "NGN", symbol: "₦", balance: "0.00" },
];

const formatBalance = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccountCards() {
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">Accounts</h2>

      <div className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 ${PANEL_TRAY}`}>
        {ACCOUNTS.map(({ currency, fiat, symbol, balance, ...account }) => (
          <div key={currency} className={`flex items-center gap-4 p-5 ${PANEL_CARD}`}>
            <CurrencyIcon account={account} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-[#141414] dark:text-white">{fiat}</p>
              <p className="mt-0.5 font-mono text-[14px] text-black/70 dark:text-white/70">
                {symbol}
                <WithTradeSession>
                  {(session) => {
                    const holdings = accountHoldings(session);
                    if (holdings === "none") return balance;
                    if (holdings === null) return "—";
                    return formatBalance(currency === "USDC" ? holdings.usdc : holdings.cngn);
                  }}
                </WithTradeSession>
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-black/55 dark:text-white/60" strokeWidth={1.75} aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}
