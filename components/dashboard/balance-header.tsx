import { BarChart2 } from "lucide-react";

export function BalanceHeader() {
  return (
    <div className="mb-6 mt-8 md:mt-12">
      <h2 className="text-[15px] font-medium text-brand">Total balance</h2>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-[28px] font-semibold text-[#133015] dark:text-white">0.00 USD</span>
        <button 
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF1EB] dark:bg-slate-800 text-[#4F5B51] dark:text-slate-300 hover:bg-[#E2E6DF] dark:hover:bg-slate-700 transition-colors"
          aria-label="View analytics"
        >
          <BarChart2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
