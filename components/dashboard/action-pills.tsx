import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ActionPillProps {
  label: string;
  variant?: "primary" | "secondary";
  hasDropdown?: boolean;
  href?: string;
}

function ActionPill({ label, variant = "secondary", hasDropdown, href }: ActionPillProps) {
  const className = cn(
    "flex h-[36px] items-center justify-center gap-1.5 rounded-full px-5 text-[14px] font-medium transition-colors",
    variant === "primary" 
      ? "bg-brand text-white hover:bg-brand-2" 
      : "bg-brand/15 text-brand dark:text-sky-300 hover:bg-brand/25"
  );

  const inner = (
    <>
      <span>{label}</span>
      {hasDropdown && <ChevronDown className="h-4 w-4 opacity-70" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button className={className}>
      {inner}
    </button>
  );
}

export function ActionPills() {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3">
      <ActionPill label="Swap" variant="primary" href="/send" />
      <ActionPill label="Connect Wallet" />
    </div>
  );
}
