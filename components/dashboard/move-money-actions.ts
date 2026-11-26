import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Landmark, Lock, Send, type LucideIcon } from "lucide-react";

export type MoveMoneyKind = "lock-rate" | "exchange" | "deposit" | "withdraw" | "send";

/**
 * Everything under "Move money", in order: the dashboard's menu and the sidebar both list this, so the two
 * can't drift apart. An entry without a `kind` isn't built yet and shows as "Soon".
 */
export const MOVE_MONEY_ACTIONS: { kind: MoveMoneyKind | null; label: string; icon: LucideIcon }[] = [
  { kind: "lock-rate", label: "Lock rate", icon: Lock },
  { kind: "exchange", label: "Exchange", icon: ArrowRightLeft },
  { kind: "deposit", label: "Deposit", icon: ArrowDownToLine },
  { kind: "withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { kind: "send", label: "Send", icon: Send },
  { kind: null, label: "Off/On Ramp", icon: Landmark },
];

export const isMoveMoneyKind = (value: string | null): value is MoveMoneyKind =>
  MOVE_MONEY_ACTIONS.some((action) => action.kind !== null && action.kind === value);
