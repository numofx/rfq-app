import { ChevronRight, Plus } from "lucide-react";
import Image from "next/image";

function CurrencyRow({ 
  flagSrc, 
  currencyName, 
  amount, 
  symbol 
}: { 
  flagSrc: string, 
  currencyName: string, 
  amount: string, 
  symbol: string 
}) {
  return (
    <div className="flex items-center justify-between py-2 cursor-pointer group">
      <div className="flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-black/10">
          <Image src={flagSrc} alt={`${currencyName} flag`} width={24} height={24} className="h-full w-full object-cover" />
        </div>
        <span className="text-[14px] font-medium text-[#133015] dark:text-white">
          {symbol}{amount}
        </span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted opacity-50 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export function AccountCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 mb-10">
      
      {/* Main Account Card */}
      <div className="relative flex flex-col overflow-hidden rounded-[24px] bg-[#F1F3ED] dark:bg-[#181818]">

        
        {/* Card Content Area */}
        <div className="relative flex-1 bg-[#F1F3ED] dark:bg-[#181818] px-6 pb-6 pt-8">
          <h3 className="text-[20px] font-semibold text-[#133015] dark:text-white">Main account</h3>
          <p className="text-[13px] text-[#4F5B51] dark:text-slate-400 mt-1 mb-6">
            $0.00 • 2 currencies
          </p>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-8">
            <CurrencyRow flagSrc="/assets/us-flag.svg" currencyName="United States" symbol="$" amount="0.00" />
            <CurrencyRow flagSrc="/assets/ng-flag.svg" currencyName="Nigeria" symbol="₦" amount="0.00" />
          </div>

          <button className="flex h-8 items-center justify-center gap-2 rounded-full bg-[#E2E6DF] dark:bg-slate-800 px-4 text-[13px] font-semibold text-[#133015] dark:text-white transition-colors hover:bg-[#D4D9D0] dark:hover:bg-slate-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Account details
          </button>
        </div>
      </div>



    </div>
  );
}
