"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Lock, LogOut, User } from "lucide-react";
import { Logo } from "@/components/layout/sidebar-layout";
import { useSignOut } from "@/components/privy-provider";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MISSING_CONFIG =
  "Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.";

const FIELD_LABEL = "block text-[15px] font-medium text-[#141414] dark:text-white";
const FIELD = "mt-2 h-[52px] w-full rounded-full px-6 text-[16px] outline-none";
const EDITABLE_FIELD = cn(
  FIELD,
  "bg-[#EFE7DC] text-[#141414] placeholder:text-black/40 focus-visible:ring-2 focus-visible:ring-black/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:focus-visible:ring-white/20"
);

function AccountCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[32px] bg-[#EDE5DA] p-3.5 dark:bg-[#242424]">
      <div className="rounded-[24px] bg-[#FDFBF7] px-5 py-8 dark:bg-[#1A1A1A] sm:px-9 sm:py-9">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#141414] dark:text-white">{title}</h2>
        <p className="mt-1 text-[15px] text-black/60 dark:text-white/60">{description}</p>
        {children}
      </div>
    </section>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const signOut = useSignOut();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("Numo");

  useEffect(() => {
    if (!supabase) {
      setErrorMessage(MISSING_CONFIG);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error || !data.user) {
          router.replace("/");
          return;
        }

        const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
        setAccountEmail(data.user.email ?? "");
        setFirstName(typeof metadata?.first_name === "string" ? metadata.first_name : "");
        setLastName(typeof metadata?.last_name === "string" ? metadata.last_name : "");
        if (typeof metadata?.team_name === "string" && metadata.team_name.trim()) {
          setTeamName(metadata.team_name.trim());
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("We couldn't load your account details. Please try again.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(MISSING_CONFIG);
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setStatusMessage("Profile updated.");
    } catch {
      setErrorMessage("Unexpected error while saving your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-[#F6F0E9] text-[#141414] dark:bg-[#111111] dark:text-white">
      <header className="mx-auto flex h-[84px] w-full max-w-[1152px] items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3.5">
          <Logo />
          <span className="-ml-4 hidden h-5 w-px bg-black/15 dark:bg-white/15 sm:block" aria-hidden="true" />
          <span className="hidden text-[17px] text-black/70 dark:text-white/70 sm:block">Account</span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 whitespace-nowrap text-[15px] font-medium transition-opacity hover:opacity-70"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to trading
          </Link>

          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE5DA] outline-none transition-colors hover:bg-[#E4DACC] focus-visible:ring-2 focus-visible:ring-black/20 dark:bg-white/10 dark:hover:bg-white/15 dark:focus-visible:ring-white/30"
              >
                <User className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 w-[240px] rounded-2xl bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:bg-[#1A1A1A]"
              >
                {accountEmail ? (
                  <div className="px-3 py-2">
                    <p className="truncate text-[14px] font-medium text-[#141414] dark:text-white">{accountEmail}</p>
                    {displayName ? (
                      <p className="mt-0.5 truncate text-[13px] text-black/60 dark:text-white/60">{displayName}</p>
                    ) : null}
                  </div>
                ) : null}
                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[15px] text-[#141414] outline-none data-[highlighted]:bg-black/5 dark:text-white dark:data-[highlighted]:bg-white/10"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Log out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[752px] px-4 pb-16 pt-8 sm:pt-12">
        <h1 className="text-center text-[40px] font-semibold leading-tight tracking-[-0.05em] sm:text-[60px]">
          Manage account
        </h1>
        <p className="mt-3 text-center text-[16px] text-black/60 dark:text-white/60 sm:text-[18px]">
          Update your profile and the teams you belong to.
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-[15px] text-black/60 dark:text-white/60">Loading account details...</p>
        ) : (
          <div className="mt-10 space-y-10">
            <AccountCard title="Profile" description="The name shown across your Numo workspace.">
              <form onSubmit={handleSaveProfile}>
                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className={FIELD_LABEL}>First name</span>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="First name"
                      className={EDITABLE_FIELD}
                    />
                  </label>
                  <label className="block">
                    <span className={FIELD_LABEL}>Last name</span>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Last name"
                      className={EDITABLE_FIELD}
                    />
                  </label>
                </div>

                <label className="mt-5 block">
                  <span className={FIELD_LABEL}>Email</span>
                  <span className="relative block">
                    <input
                      type="email"
                      value={accountEmail}
                      readOnly
                      aria-describedby="account-email-help"
                      className={cn(
                        FIELD,
                        "bg-[#F3EFE9] pr-12 font-mono text-[15px] text-black/60 dark:bg-white/[0.03] dark:text-white/60"
                      )}
                    />
                    <Lock
                      className="absolute right-6 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-black/60 dark:text-white/60"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                </label>
                <p id="account-email-help" className="mt-3 text-[14px] text-black/60 dark:text-white/60">
                  Contact support to change your email.
                </p>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="mt-6 h-[52px] w-full rounded-full bg-[#141414] text-[16px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#141414] dark:hover:bg-white/90"
                >
                  {isSaving ? "Saving..." : "Save profile"}
                </button>

                <p
                  aria-live="polite"
                  className={cn(
                    "text-center text-[14px]",
                    (statusMessage || errorMessage) && "mt-3",
                    errorMessage ? "text-[#B4412F] dark:text-[#E98A7A]" : "text-black/60 dark:text-white/60"
                  )}
                >
                  {errorMessage || statusMessage}
                </p>
              </form>
            </AccountCard>

            <AccountCard title="Teams" description="Teams currently associated with your account.">
              <div className="mt-6 flex h-16 items-center gap-3.5 rounded-full bg-[#EFE7DC] pl-3 pr-5 dark:bg-white/5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FDFBF7] dark:bg-white/10">
                  <Image src="/favicon-32x32.png" alt="" width={20} height={20} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{teamName}</span>
                <span className="shrink-0 rounded-[5px] bg-[#A9D4F0] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#141414]">
                  Current
                </span>
              </div>
            </AccountCard>
          </div>
        )}
      </main>
    </div>
  );
}
