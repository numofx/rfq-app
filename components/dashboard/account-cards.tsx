import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";

export const ACCOUNTS = [
  { iconSrc: "/tokens/usdc.svg", currency: "USDC", symbol: "$", balance: "0.00" },
  { iconSrc: "/tokens/cngn.png", currency: "cNGN", symbol: "₦", balance: "0.00" },
];

export function AccountCards() {
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">Accounts</h2>

      <div className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 ${PANEL_TRAY}`}>
        {ACCOUNTS.map(({ iconSrc, currency, symbol, balance }) => (
          <div key={currency} className={`flex items-center gap-4 p-5 ${PANEL_CARD}`}>
            <Image src={iconSrc} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-[#141414] dark:text-white">{currency}</p>
              <p className="mt-0.5 font-mono text-[14px] text-black/70 dark:text-white/70">
                {symbol}
                {balance}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-black/55 dark:text-white/60" strokeWidth={1.75} aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}
