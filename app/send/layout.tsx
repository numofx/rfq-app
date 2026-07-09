import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

export default function SendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex h-[80px] items-center justify-between border-b border-black/5 px-6 md:px-10">
        
        {/* Left: Logo */}
        <div className="flex items-center">
          <div className="relative h-8 w-[100px]">
            <Image 
              src="/numo.png" 
              alt="Numo" 
              fill 
              className="object-contain object-left" 
            />
          </div>
        </div>

        {/* Center: Progress Steps */}
        <div className="hidden md:flex flex-col items-center justify-center space-y-2">
          {/* Progress Bar (Visual) */}
          <div className="flex w-[400px] h-[3px] bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 w-[0%]" /> 
          </div>
          {/* Step Labels */}
          <div className="flex w-[400px] justify-between text-[13px] font-medium text-slate-500">
            <span className="text-black font-semibold">Recipient</span>
            <span>Amount</span>
            <span>Review</span>
            <span>Pay</span>
          </div>
        </div>

        {/* Right: Avatar & Close */}
        <div className="flex items-center gap-6">
          <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/avatar.png" alt="Profile" className="h-full w-full object-cover" />
          </div>
          <Link href="/dashboard" className="text-slate-600 hover:text-black transition-colors">
            <X className="h-6 w-6" />
          </Link>
        </div>

      </header>

      {/* Main Content Area */}
      <main className="flex justify-center p-6 md:p-10">
        <div className="w-full max-w-[600px]">
          {children}
        </div>
      </main>
    </div>
  );
}
