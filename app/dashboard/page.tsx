"use client";

import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { BalanceHeader } from "@/components/dashboard/balance-header";
import { AccountCards } from "@/components/dashboard/account-cards";
import { MoveMoney } from "@/components/dashboard/move-money";
import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";
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
            {user?.firstName ? (
              <>
                Welcome back,
                <br />
                {user.firstName}
              </>
            ) : (
              "Welcome back"
            )}
          </h1>
          <MoveMoney open={isMoveMoneyOpen} onOpenChange={setIsMoveMoneyOpen} />
        </div>

        {/* The two-line greeting already stands taller than the button beside it. */}
        <div className={user?.firstName ? "mt-2" : "mt-8"}>
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
            {/* Not a link until there is a transactions page to open. */}
            <span className="text-[14px] text-black/55 dark:text-white/60">View all</span>
          </div>
          <div className={`mt-4 ${PANEL_TRAY}`}>
            <div className={`${PANEL_CARD} px-6 py-10 text-center`}>
              <p className="text-[15px] font-medium text-[#141414] dark:text-white">No transactions yet</p>
              <p className="mt-1 text-[14px] text-black/55 dark:text-white/60">
                Exchanges and transfers will show up here.
              </p>
            </div>
          </div>
        </section>
      </div>
    </SidebarLayout>
  );
}
