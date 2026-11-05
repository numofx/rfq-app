"use client";

import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTheme } from "next-themes";
import {
  ArrowRightLeft,
  ChevronDown,
  Home,
  Landmark,
  List,
  LogOut,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useAccountUser } from "@/lib/hooks/useAccountUser";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  isActive?: boolean;
  isSoon?: boolean;
}

function SidebarItem({ icon: Icon, label, href, isActive, isSoon }: SidebarItemProps) {
  const className = cn(
    "flex h-11 items-center gap-3 rounded-full px-3.5 text-[15px] transition-colors",
    isActive
      ? "bg-[#FDFBF7] font-medium text-[#141414] dark:bg-white/10 dark:text-white"
      : "text-black/60 dark:text-white/60",
    !isActive && !isSoon && "hover:bg-[#E4DACC] hover:text-[#141414] dark:hover:bg-white/5 dark:hover:text-white"
  );

  const inner = (
    <>
      <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {isSoon && (
        <span className="rounded-full bg-[#E0D5C7] px-2.5 py-0.5 text-[12px] text-black/70 dark:bg-white/10 dark:text-white/60">
          Soon
        </span>
      )}
    </>
  );

  if (isSoon) {
    return <div className={cn(className, "cursor-default")}>{inner}</div>;
  }

  return (
    <Link href={href} className={className} aria-current={isActive ? "page" : undefined}>
      {inner}
    </Link>
  );
}

const menuItemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-[#141414] outline-none data-[highlighted]:bg-black/5 dark:text-white dark:data-[highlighted]:bg-white/10";

function AccountMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const user = useAccountUser();

  const handleLogout = async () => {
    await supabase?.auth.signOut();
    router.push("/");
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className={cn(
            "flex items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-[#E4DACC] focus-visible:ring-2 focus-visible:ring-black/20 dark:hover:bg-white/5 dark:focus-visible:ring-white/30",
            compact ? "p-1" : "w-full p-2"
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDFBF7] dark:bg-white/10">
            <Image src="/favicon-32x32.png" alt="" width={20} height={20} />
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[#141414] dark:text-white">
                  {user?.teamName ?? "Numo"}
                </span>
                {user?.email && (
                  <span className="block truncate text-[13px] text-black/60 dark:text-white/60">{user.email}</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-black/60 dark:text-white/60" />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={compact ? "bottom" : "top"}
          align={compact ? "end" : "start"}
          sideOffset={8}
          className="z-50 w-[228px] rounded-xl border border-black/10 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#1A1A1A]"
        >
          <DropdownMenu.Item asChild className={menuItemClass}>
            <Link href="/profile">
              <User className="h-4 w-4" strokeWidth={1.75} />
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Moon className="h-4 w-4" strokeWidth={1.75} />
            )}
            {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-black/5 dark:bg-white/10" />
          <DropdownMenu.Item className={menuItemClass} onSelect={handleLogout}>
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Logo() {
  return (
    <Link href="/dashboard" className="relative block h-[26px] w-[92px]">
      <Image src="/numo.png" alt="Numo" fill className="object-contain object-left dark:hidden" priority />
      <Image src="/numo_logo_white.png" alt="Numo" fill className="hidden object-contain object-left dark:block" priority />
    </Link>
  );
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#EDE5DA] dark:bg-[#0A0A0A] md:flex-row">
      {/* Sidebar */}
      <aside className="hidden w-[275px] shrink-0 flex-col overflow-y-auto overscroll-y-none px-6 pb-5 pt-8 md:flex">
        <div className="mb-8 pl-3.5">
          <Logo />
        </div>

        <nav className="flex-1">
          <div className="space-y-0.5">
            <SidebarItem icon={Home} label="Home" href="/dashboard" isActive={pathname === "/dashboard"} />
            <SidebarItem icon={List} label="Transactions" href="#" />
            <SidebarItem icon={Settings} label="Settings" href="/account" isActive={pathname === "/profile"} />
          </div>

          <p className="mb-2 mt-8 px-3.5 text-[12px] text-black/60 dark:text-white/50">Move money</p>
          <div className="space-y-0.5">
            <SidebarItem icon={ArrowRightLeft} label="Exchange" href="#" isSoon />
            <SidebarItem icon={Landmark} label="Off/On Ramp" href="#" isSoon />
          </div>
        </nav>

        <AccountMenu />
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-[#F6F0E9] px-4 dark:bg-[#111111] md:hidden">
        <Logo />
        <AccountMenu compact />
      </header>

      {/* Main Content */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none bg-[#F6F0E9] dark:bg-[#111111] md:my-3 md:mr-3 md:rounded-[28px]">
        {children}
      </main>
    </div>
  );
}
