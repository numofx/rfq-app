import { PANEL_CARD, PANEL_TRAY } from "@/components/dashboard/panel-styles";

/** An account with no activity yet. */
export function TransactionsEmpty() {
  return (
    <div className={`mt-4 ${PANEL_TRAY}`}>
      <div className={`${PANEL_CARD} px-6 py-10 text-center`}>
        <p className="text-[15px] font-medium text-[#141414] dark:text-white">No transactions yet</p>
        <p className="mt-1 text-[14px] text-black/55 dark:text-white/60">
          Exchanges and transfers will show up here.
        </p>
      </div>
    </div>
  );
}
