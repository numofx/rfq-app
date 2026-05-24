"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { 
  Home, 
  List, 
  ArrowRightLeft, 
  Calendar, 
  RefreshCw, 
  Receipt, 
  Users, 
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  hasDropdown?: boolean;
  isOpen?: boolean;
  onClick?: () => void;
  href?: string;
  children?: React.ReactNode;
}

function SidebarItem({ icon: Icon, label, isActive, hasDropdown, isOpen, onClick, href, children }: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-full px-4 py-2.5 transition-colors",
        isActive ? "bg-[#EEF1EB] dark:bg-slate-800 text-[#133015] dark:text-white" : "text-[#4F5B51] dark:text-slate-300 hover:bg-[#EEF1EB]/50 dark:hover:bg-slate-800/50"
      )}
    >
      <div className="flex items-center gap-3 font-medium text-[14px]">
        <Icon className={cn("h-[18px] w-[18px]", isActive ? "text-brand" : "text-[#7B8B7D] dark:text-slate-400")} />
        <span>{label}</span>
      </div>
      {hasDropdown && (
        isOpen ? <ChevronUp className="h-4 w-4 text-[#7B8B7D] dark:text-slate-400" /> : <ChevronDown className="h-4 w-4 text-[#7B8B7D] dark:text-slate-400" />
      )}
    </div>
  );

  return (
    <div className="mb-1">
      {href ? (
        <Link href={href} onClick={onClick} className="block w-full">
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className="block w-full">
          {content}
        </button>
      )}
      {hasDropdown && isOpen && (
        <div className="mt-1 flex flex-col pl-7 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

function SubItem({ icon: Icon, label, isActive }: { icon: React.ElementType, label: string, isActive?: boolean }) {
  return (
    <Link href="#" className={cn(
      "flex items-center gap-3 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors",
      isActive ? "text-[#133015] dark:text-white" : "text-[#4F5B51] dark:text-slate-300 hover:bg-[#EEF1EB]/50 dark:hover:bg-slate-800/50"
    )}>
      <Icon className={cn("h-4 w-4", isActive ? "text-brand" : "text-[#7B8B7D] dark:text-slate-400")} />
      <span>{label}</span>
    </Link>
  );
}

import { ThemeToggle } from "@/components/ui/theme-toggle";
import Image from "next/image";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-white dark:bg-[#0A0A0A]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-screen w-[260px] flex-col overflow-y-auto border-r border-[#EFEFEF] dark:border-slate-800 bg-white dark:bg-[#0A0A0A] px-4 py-6 md:flex">
        
        {/* Logo */}
        <div className="mb-8 pl-4">
          <Link href="/" className="flex items-center">
            <div className="relative h-[42px] w-[154px]">
              <Image src="/numo.png" alt="Numo" fill className="object-contain object-left dark:hidden" priority />
              <Image src="/numo_logo_white.png" alt="Numo" fill className="hidden dark:block object-contain object-left" priority />
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <SidebarItem icon={Home} label="Home" isActive href="#" />
          <SidebarItem icon={List} label="Transactions" href="#" />
          
          <SidebarItem 
            icon={ArrowRightLeft} 
            label="Payments" 
            hasDropdown 
            isOpen={isPaymentsOpen}
            onClick={() => setIsPaymentsOpen(!isPaymentsOpen)}
          >
            <SubItem icon={Calendar} label="Scheduled" />
            <SubItem icon={RefreshCw} label="Direct Debits" />
            <SubItem icon={Receipt} label="Payment requests" />
          </SidebarItem>

          <SidebarItem icon={Users} label="Recipients" href="#" />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-[260px] flex flex-col">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-end px-6 md:px-10 shrink-0">
          <div className="flex items-center gap-3 mt-4">
            <ThemeToggle />
            <button
              type="button"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#EFEFEF] dark:border-slate-800 bg-white dark:bg-[#0A0A0A] text-[#133015] dark:text-white ring-1 ring-black/5 dark:ring-white/10 hover:bg-[#F8F9F7] dark:hover:bg-slate-800 transition-colors"
              aria-label="Open account menu"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[20px] w-[20px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4.2" />
                <path d="M4.5 20c1.6-3.1 4.4-4.8 7.5-4.8s5.9 1.7 7.5 4.8" />
              </svg>
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
