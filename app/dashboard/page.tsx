"use client";

import { useState } from "react";
import Link from "next/link";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { BalanceHeader } from "@/components/dashboard/balance-header";
import { AccountCards } from "@/components/dashboard/account-cards";
import { MoveMoney } from "@/components/dashboard/move-money";
import { TransactionsEmpty } from "@/components/dashboard/transactions-empty";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { useAccountUser } from "@/lib/hooks/useAccountUser";

export default function TradePage() {
  const user = useAccountUser();
  const [isMoveMoneyOpen, setIsMoveMoneyOpen] = useState(false);

  return (
    <SidebarLayout>
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 md:px-12 md:pt-8">
        {/* Deposits have no flow yet, so Add funds opens the menu that shows Deposit as coming soon. */}
        <WelcomeBanner onAddFunds={() => setIsMoveMoneyOpen(true)} />

        {/* Greeting */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[32px] font-semibold leading-[36px] tracking-[-0.03em] text-[#141414] dark:text-white">
            {user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back"}
          </h1>
          <MoveMoney open={isMoveMoneyOpen} onOpenChange={setIsMoveMoneyOpen} />
        </div>

        <div className="mt-8">
          <BalanceHeader accountCreatedAt={user?.createdAt ?? null} />
        </div>

        <div className="mt-10">
          <AccountCards />
        </div>

        {/* Transactions */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">
              Transactions
            </h2>
            <Link
              href="/transactions"
              className="text-[14px] text-black/55 transition-colors hover:text-[#141414] dark:text-white/60 dark:hover:text-white"
            >
              View all
            </Link>
          </div>
          <TransactionsEmpty />
        </section>
      </div>
    </SidebarLayout>
  );
}
