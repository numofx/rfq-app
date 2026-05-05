"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RFQInterface } from "@/components/forms/rfq-interface";
import { AppLayout, CardWrapper, ContentLayout } from "@/components/layout/page-shell";
import { AppBg } from "@/components/ui/app-bg";
import { supabase } from "@/lib/supabase/client";

type MarketId = "spot" | "june30-2026" | "dec31-2026";

interface MarketOption {
  id: MarketId;
  label: string;
  title: string;
  kind: "Spot" | "Future";
}

const MARKET_OPTIONS: MarketOption[] = [
  { id: "spot", label: "USDC-cNGN", title: "USDC-cNGN SPOT", kind: "Spot" },
  { id: "june30-2026", label: "USDC-cNGN JUNE30 2026", title: "USDC-cNGN JUNE30 2026", kind: "Future" },
  { id: "dec31-2026", label: "USDC-cNGN DEC31 2026", title: "USDC-cNGN DEC31 2026", kind: "Future" },
];

function MarketSelector({
  selectedMarket,
  onChange,
}: {
  selectedMarket: MarketOption;
  onChange: (market: MarketOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-border/70 bg-panel-2/60 px-4 py-2 text-[11px] font-semibold tracking-[0.04em] text-text transition-colors hover:bg-panel-2"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span>{selectedMarket.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-3.5 w-3.5 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-40 mt-2 min-w-[260px] rounded-2xl border border-border/70 bg-panel p-1.5 shadow-panel backdrop-blur-panel">
          <div role="listbox" aria-label="Select market" className="space-y-1">
            {MARKET_OPTIONS.map((market) => {
              const selected = market.id === selectedMarket.id;
              return (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => {
                    onChange(market);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                    selected ? "bg-white text-black" : "text-text hover:bg-panel-2/80"
                  }`}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="text-[12px] font-semibold">{market.label}</span>
                  <span className={`text-[10px] font-semibold tracking-[0.04em] ${selected ? "text-black/70" : "text-muted"}`}>
                    {market.kind}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TradePage() {
  const router = useRouter();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<MarketOption>(MARKET_OPTIONS[0]);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!isMounted || error || !data.user) return;
        const user = data.user;
        const metadata = user.user_metadata as Record<string, unknown> | undefined;
        const first = typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
        const last = typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
        const fullName = [first, last].filter(Boolean).join(" ");
        const fallbackName = typeof metadata?.name === "string" ? metadata.name.trim() : "";

        setAccountName(fullName || fallbackName || "User");
        setAccountEmail(user.email ?? "No email available");
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setIsAccountMenuOpen(false);
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/");
  };

  const headerRight = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsAccountMenuOpen((prev) => !prev)}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-border/70 bg-panel-2/70 text-text ring-1 ring-white/10 hover:bg-panel-2"
        aria-label="Open account menu"
        aria-expanded={isAccountMenuOpen}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[20px] w-[20px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4.2" />
          <path d="M4.5 20c1.6-3.1 4.4-4.8 7.5-4.8s5.9 1.7 7.5 4.8" />
        </svg>
      </button>

      {isAccountMenuOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-[240px] rounded-2xl border border-border/70 bg-panel p-4 shadow-panel backdrop-blur-panel">
          <p className="text-[15px] leading-none font-semibold text-text">{accountEmail}</p>
          <p className="mt-1.5 text-[13px] font-medium text-muted">{accountName}</p>

          <div className="mt-3 border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={() => {
                setIsAccountMenuOpen(false);
                router.push("/account");
              }}
              className="block text-[14px] font-medium text-text hover:text-white active:font-semibold"
            >
              Manage account
            </button>

            <button
              type="button"
              onClick={() => setIsAccountMenuOpen(false)}
              className="mt-2 block text-[14px] font-medium text-text hover:text-white active:font-semibold"
            >
              Transaction history
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 block text-[14px] font-semibold text-muted hover:text-text"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const headerLeft = <MarketSelector selectedMarket={selectedMarket} onChange={setSelectedMarket} />;

  return (
    <AppBg>
      <AppLayout headerLeft={headerLeft} headerRight={headerRight} className="bg-transparent text-text">
        <ContentLayout variant="rfq">
          <CardWrapper size="ticket" className="max-w-[1000px]">
            <RFQInterface marketLabel={selectedMarket.label} marketTitle={selectedMarket.title} marketKind={selectedMarket.kind} />
          </CardWrapper>
        </ContentLayout>
      </AppLayout>
    </AppBg>
  );
}
