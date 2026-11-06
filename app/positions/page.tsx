"use client";

import { PositionsView } from "@/components/dashboard/positions-view";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default function PositionsPage() {
  return (
    <SidebarLayout>
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 md:px-12 md:pt-8">
        <h1 className="text-[32px] font-semibold leading-[36px] tracking-[-0.03em] text-[#141414] dark:text-white">
          Positions
        </h1>
        <PositionsView />
      </div>
    </SidebarLayout>
  );
}
