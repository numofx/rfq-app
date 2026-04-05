"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RFQInterface } from "@/components/forms/rfq-interface";
import { AppLayout, CardWrapper, ContentLayout } from "@/components/layout/page-shell";
import { AppBg } from "@/components/ui/app-bg";
import { SegmentedTabs } from "@/components/ui/rfq-primitives";
import { supabase } from "@/lib/supabase/client";

export default function TradePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"futures" | "options">("options");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

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
              onClick={() => setIsAccountMenuOpen(false)}
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

  const headerCenter = (
    <div className="w-[220px]">
      <SegmentedTabs
        value={mode}
        onChange={setMode}
        options={[
          { label: "Hedge", value: "futures" },
          { label: "Advanced", value: "options" },
        ]}
      />
    </div>
  );

  return (
    <AppBg>
      <AppLayout headerCenter={headerCenter} headerRight={headerRight} className="bg-transparent text-text">
        <ContentLayout variant="rfq">
          <CardWrapper size="ticket" className="max-w-[980px]">
            <RFQInterface mode={mode} />
          </CardWrapper>
        </ContentLayout>
      </AppLayout>
    </AppBg>
  );
}
