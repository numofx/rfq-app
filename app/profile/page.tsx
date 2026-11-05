"use client";

import { ChangeEvent, ElementType, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Bell, Camera, Check, ChevronRight, CircleHelp, Copy, FileText, LogOut, Shield } from "lucide-react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAccountUser } from "@/lib/hooks/useAccountUser";
import { useSignOut } from "@/components/privy-provider";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ProfileRow {
  icon: ElementType;
  title: string;
  description: string;
  // Rows without a page yet do nothing.
  href?: string;
}

const ACCOUNT_ROWS: ProfileRow[] = [
  { icon: CircleHelp, title: "Help", description: "Guides, FAQs and support.", href: "https://docs.numofx.com" },
  { icon: FileText, title: "Statements and reports", description: "Download monthly statements." },
];

const SETTINGS_ROWS: ProfileRow[] = [
  { icon: Shield, title: "Security and privacy", description: "Change your security and privacy settings." },
  { icon: Bell, title: "Notifications", description: "Customise how you get updates." },
];

const CARD_FRAME = "rounded-[28px] bg-[#EDE5DA] dark:bg-[#242424]";
const CARD_SURFACE = "bg-[#FDFBF7] dark:bg-[#1A1A1A]";

function ProfileRowItem({ row, isFirst }: { row: ProfileRow; isFirst: boolean }) {
  const { icon: Icon, title, description, href } = row;
  const className =
    "flex w-full items-center gap-4 pl-4 text-left outline-none transition-colors hover:bg-black/[0.02] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/15 dark:hover:bg-white/5 dark:focus-visible:ring-white/20";
  const inner = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F3EFE9] dark:bg-white/5">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span
        className={cn(
          "flex min-h-[76px] min-w-0 flex-1 items-center gap-3 py-3 pr-5",
          !isFirst && "border-t border-black/[0.07] dark:border-white/10"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium leading-tight text-[#141414] dark:text-white">{title}</span>
          <span className="mt-0.5 block text-[14px] text-black/60 dark:text-white/60">{description}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-black/70 dark:text-white/70" strokeWidth={1.75} aria-hidden="true" />
      </span>
    </>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <button type="button" className={className}>
      {inner}
    </button>
  );
}

function ProfileRows({ title, rows }: { title: string; rows: ProfileRow[] }) {
  return (
    <section>
      <h2 className="pl-1 text-[24px] font-semibold tracking-[-0.03em] text-[#141414] dark:text-white">{title}</h2>
      <div className={cn(CARD_FRAME, "mt-3 p-3")}>
        <div className={cn(CARD_SURFACE, "overflow-hidden rounded-[20px]")}>
          {rows.map((row, index) => (
            <ProfileRowItem key={row.title} row={row} isFirst={index === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const signOut = useSignOut();
  const user = useAccountUser();
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(
    () => () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    },
    [avatarUrl]
  );

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const initials = (
    user?.firstName || user?.lastName
      ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
      : (user?.email.charAt(0) ?? "")
  ).toUpperCase();

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <SidebarLayout>
      <div className="grid grid-cols-1 items-start gap-8 px-4 py-6 md:px-12 md:py-10 xl:grid-cols-[370px_minmax(0,640px)]">
        <section
          className={cn(
            CARD_FRAME,
            "mx-auto w-full max-w-[370px] rounded-[32px] p-3.5 shadow-[0_24px_48px_-24px_rgba(60,40,20,0.25)] dark:shadow-none xl:mx-0"
          )}
        >
          <div className={cn(CARD_SURFACE, "rounded-[24px] px-8 pb-5 pt-10 text-center")}>
            <div className="relative mx-auto h-[104px] w-[104px]">
              {avatarUrl ? (
                // A blob URL from the file picker, which next/image cannot load.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#EDE5DA] text-[36px] font-semibold tracking-[-0.05em] text-black/70 dark:bg-white/10 dark:text-white/80">
                  {initials}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                aria-label="Change photo"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#141414] text-white outline-none ring-[3px] ring-[#FDFBF7] transition-colors hover:bg-black focus-visible:ring-black/30 dark:bg-white dark:text-[#141414] dark:ring-[#1A1A1A]"
              >
                <Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <h1 className="mt-6 min-h-[38px] break-words text-[32px] font-semibold leading-[38px] tracking-[-0.04em] text-[#141414] dark:text-white">
              {displayName}
            </h1>
            <p className="mt-1 min-h-6 truncate text-[16px] text-black/60 dark:text-white/60">{user?.email}</p>

            <p className="mt-6 text-[14px] font-medium text-[#141414] dark:text-white">Your wallet</p>
            {address ? (
              <button
                type="button"
                onClick={copyAddress}
                aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
                className="mx-auto mt-2 flex h-11 items-center gap-2.5 rounded-full bg-[#EFE7DC] px-5 font-mono text-[15px] font-medium text-[#141414] outline-none transition-colors hover:bg-[#E4DACC] focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
              >
                {address.slice(0, 5)}…{address.slice(-4)}
                {copied ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            ) : (
              <p className="mx-auto mt-2 flex h-11 w-fit items-center rounded-full bg-[#EFE7DC] px-5 text-[15px] text-black/60 dark:bg-white/5 dark:text-white/60">
                No wallet connected
              </p>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 border-t border-black/[0.07] pt-4 text-[15px] font-medium text-[#B4412F] outline-none transition-opacity hover:opacity-70 focus-visible:underline dark:border-white/10 dark:text-[#E98A7A]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Log out
            </button>
          </div>
        </section>

        <div className="space-y-8">
          <ProfileRows title="Your account" rows={ACCOUNT_ROWS} />
          <ProfileRows title="Settings" rows={SETTINGS_ROWS} />
        </div>
      </div>
    </SidebarLayout>
  );
}
