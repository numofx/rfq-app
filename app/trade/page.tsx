"use client";

import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { BalanceHeader } from "@/components/dashboard/balance-header";
import { ActionPills } from "@/components/dashboard/action-pills";
import { AccountCards } from "@/components/dashboard/account-cards";

export default function TradePage() {
  return (
    <SidebarLayout>
      <div className="mx-auto max-w-[900px] px-6 py-4 md:px-10">
        <BalanceHeader />
        <ActionPills />
        <AccountCards />

        {/* Transactions Section */}
        <div className="mt-2 flex items-center justify-between pb-4">
          <h2 className="text-[22px] font-semibold text-[#133015] dark:text-white">Transactions</h2>
          <button className="text-[13px] font-bold text-[#133015] dark:text-white underline decoration-2 underline-offset-4 hover:text-[#4F5B51] dark:hover:text-slate-300 transition-colors">
            See all
          </button>
        </div>
      </div>
    </SidebarLayout>
  );
}
