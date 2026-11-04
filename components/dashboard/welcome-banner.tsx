"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISSED_KEY = "numo:welcome-banner-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Blocked storage only means the banner comes back on the next visit.
  }
}

/** Stays hidden until storage has been read, so a dismissed banner never flashes back. */
export function WelcomeBanner({ onAddFunds }: { onAddFunds: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(!readDismissed());
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="mb-10 flex items-center gap-3 rounded-2xl bg-[#FDFBF7] py-3 pl-4 pr-3 text-[14px] dark:bg-[#1A1A1A] sm:min-h-[52px] sm:rounded-full">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#3B82DC]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-black/70 dark:text-white/70">
        Your account is ready. Add funds to start hedging.
      </p>
      <button
        type="button"
        onClick={onAddFunds}
        className="shrink-0 font-medium text-[#141414] underline underline-offset-4 outline-none hover:text-black focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white dark:focus-visible:ring-white/30"
      >
        Add funds
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          saveDismissed();
          setIsVisible(false);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/55 outline-none transition-colors hover:bg-black/5 hover:text-[#141414] focus-visible:ring-2 focus-visible:ring-black/20 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/30"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
