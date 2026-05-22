import type { ReactNode } from "react";

interface AppBgProps {
  children: ReactNode;
  className?: string;
}

export function AppBg({ children, className }: AppBgProps) {
  return (
    <div className={`min-h-screen bg-bg text-text ${className ?? ""}`.trim()}>
      <div className="relative">{children}</div>
    </div>
  );
}
