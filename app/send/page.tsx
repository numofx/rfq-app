"use client";

import Link from "next/link";
import { ArrowLeft, Search, ChevronRight } from "lucide-react";
import { useState } from "react";

const CURRENCIES = [
  {
    code: "EUR",
    name: "Euro",
    flag: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="20" fill="#003399"/>
        <path d="M20 9L21.3106 13.0335H25.5528L22.1211 15.527L23.4317 19.5605L20 17.067L16.5683 19.5605L17.8789 15.527L14.4472 13.0335H18.6894L20 9Z" fill="#FFCC00"/>
        {/* Mocking a few stars for EU flag */}
        <circle cx="20" cy="11" r="1.5" fill="#FFCC00"/>
        <circle cx="20" cy="29" r="1.5" fill="#FFCC00"/>
        <circle cx="11" cy="20" r="1.5" fill="#FFCC00"/>
        <circle cx="29" cy="20" r="1.5" fill="#FFCC00"/>
        <circle cx="13.6" cy="13.6" r="1.5" fill="#FFCC00"/>
        <circle cx="26.4" cy="26.4" r="1.5" fill="#FFCC00"/>
        <circle cx="13.6" cy="26.4" r="1.5" fill="#FFCC00"/>
        <circle cx="26.4" cy="13.6" r="1.5" fill="#FFCC00"/>
      </svg>
    )
  },
  {
    code: "NGN",
    name: "Nigerian naira",
    flag: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <clipPath id="ngn-clip">
          <circle cx="20" cy="20" r="20" />
        </clipPath>
        <g clipPath="url(#ngn-clip)">
          <rect width="13.33" height="40" fill="#008751" />
          <rect x="13.33" width="13.34" height="40" fill="#FFFFFF" />
          <rect x="26.67" width="13.33" height="40" fill="#008751" />
        </g>
      </svg>
    )
  },
  {
    code: "USD",
    name: "United States dollar",
    flag: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <clipPath id="usd-clip">
          <circle cx="20" cy="20" r="20" />
        </clipPath>
        <g clipPath="url(#usd-clip)">
          <rect width="40" height="40" fill="#FFFFFF" />
          <rect y="4" width="40" height="4" fill="#B22234" />
          <rect y="12" width="40" height="4" fill="#B22234" />
          <rect y="20" width="40" height="4" fill="#B22234" />
          <rect y="28" width="40" height="4" fill="#B22234" />
          <rect y="36" width="40" height="4" fill="#B22234" />
          <rect width="20" height="22" fill="#3C3B6E" />
        </g>
      </svg>
    )
  }
];

export default function SendPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCurrencies = CURRENCIES.filter(c => 
    c.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      {/* Back Button */}
      <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-2 transition-colors mb-12 self-start">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* Main Form Area */}
      <div className="w-full">
        <h1 className="text-center text-[28px] font-bold text-black mb-8 tracking-tight">
          Select their currency
        </h1>

        {/* Search Input */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search currency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-slate-200 focus:border-brand focus:outline-none transition-colors text-lg text-black placeholder:text-slate-400"
          />
        </div>

        {/* Currency List */}
        <div>
          <h3 className="text-[13px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            Search results
          </h3>
          <div className="border-t border-slate-100 mb-2" />
          
          <div className="flex flex-col">
            {filteredCurrencies.map((currency) => (
              <button
                key={currency.code}
                className="group flex items-center justify-between py-4 hover:bg-slate-50 transition-colors -mx-4 px-4 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 shrink-0 shadow-sm rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                    {currency.flag}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-bold text-black text-[15px]">{currency.code}</span>
                    <span className="text-slate-500 text-[14px]">{currency.name}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-black transition-colors" />
              </button>
            ))}
            
            {filteredCurrencies.length === 0 && (
              <div className="py-10 text-center text-slate-500">
                No currencies found for &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
