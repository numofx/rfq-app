import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionPillProps {
  label: string;
  variant?: "primary" | "secondary";
  hasDropdown?: boolean;
}

function ActionPill({ label, variant = "secondary", hasDropdown }: ActionPillProps) {
  return (
    <button
      className={cn(
        "flex h-[36px] items-center justify-center gap-1.5 rounded-full px-5 text-[14px] font-medium transition-colors",
        variant === "primary" 
          ? "bg-brand text-white hover:bg-brand-2" 
          : "bg-brand/15 text-brand dark:text-sky-300 hover:bg-brand/25"
      )}
    >
      <span>{label}</span>
      {hasDropdown && <ChevronDown className="h-4 w-4 opacity-70" />}
    </button>
  );
}

export function ActionPills() {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3">
      <ActionPill label="Send" variant="primary" />
      <ActionPill label="Add money" />
      <ActionPill label="Request" hasDropdown />
      <ActionPill label="Upload" />
    </div>
  );
}
