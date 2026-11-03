"use client";

import Image from "next/image";
import { FileText } from "lucide-react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { BalanceHeader } from "@/components/dashboard/balance-header";
import { AccountCards } from "@/components/dashboard/account-cards";
import { MoveMoney } from "@/components/dashboard/move-money";
import { useAccountUser } from "@/lib/hooks/useAccountUser";

export default function TradePage() {
  const user = useAccountUser();

  return (
    <SidebarLayout>
      <div className="mx-auto w-full max-w-[1240px] px-6 pb-16 pt-6 md:px-16">
        {/* Welcome banner */}
        <div className="flex items-center gap-4 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-transparent">
          <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#E8F3FB] to-[#8EC9EE]">
            <Image src="/favicon-32x32.png" alt="" width={32} height={32} />
          </div>
          <div className="min-w-0 text-[15px]">
            <p className="text-[#141414] dark:text-white">Welcome to Numo</p>
            <p className="mt-0.5 text-black/55 dark:text-white/60">
              Your account is ready. Swap between USDC and cNGN.
            </p>
          </div>
        </div>

        {/* Greeting */}
        <div className="mt-9 flex items-center justify-between gap-4">
          <h1 className="text-[21px] text-[#141414] dark:text-white">
            {user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back"}
          </h1>
          <MoveMoney />
        </div>

        <div className="mt-10">
          <BalanceHeader accountCreatedAt={user?.createdAt ?? null} />
        </div>

        <div className="mt-14">
          <AccountCards />
        </div>

        {/* Transactions */}
        <section className="mt-12">
          <h2 className="text-[16px] text-[#141414] dark:text-white">Transactions</h2>
          <div className="mt-5 flex flex-col items-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#EDE5DA] dark:bg-white/5">
              <FileText className="h-5 w-5 text-black/55 dark:text-white/60" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] text-black/55 dark:text-white/60">No transactions yet</p>
          </div>
        </section>
      </div>
    </SidebarLayout>
  );
}
