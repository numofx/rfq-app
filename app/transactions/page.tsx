"use client";

import { TransactionsEmpty } from "@/components/dashboard/transactions-empty";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default function TransactionsPage() {
  return (
    <SidebarLayout>
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 md:px-12 md:pt-8">
        <h1 className="text-[32px] font-semibold leading-[36px] tracking-[-0.03em] text-[#141414] dark:text-white">
          Transactions
        </h1>
        <div className="mt-4">
          <TransactionsEmpty />
        </div>
      </div>
    </SidebarLayout>
  );
}
