"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout, CardWrapper, ContentLayout } from "@/components/layout/page-shell";
import { AppBg } from "@/components/ui/app-bg";
import { supabase } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (!supabase) {
      setErrorMessage(
        "Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
      );
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
    setIsAccountMenuOpen(false);
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/");
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(
        "Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
      );
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

  const handlePasswordReset = async () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(
        "Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
      );
      return;
    }

    if (!accountEmail) {
      setErrorMessage("No email is available for this account.");
      return;
    }

    try {
      setIsSendingReset(true);
      const { error } = await supabase.auth.resetPasswordForEmail(accountEmail, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setStatusMessage("Password reset email sent.");
    } catch {
      setErrorMessage("Unexpected error while sending the password reset email.");
    } finally {
      setIsSendingReset(false);
    }
  };

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "User";

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
          <p className="text-[15px] leading-none font-semibold text-text">{accountEmail || "No email available"}</p>
          <p className="mt-1.5 text-[13px] font-medium text-muted">{displayName}</p>

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

  return (
    <AppBg>
      <AppLayout headerRight={headerRight} className="bg-transparent text-text">
        <ContentLayout variant="default" className="py-10">
          <CardWrapper size="ticket" className="mx-auto max-w-[720px]">
            <div className="rounded-[28px] border border-border/70 bg-panel/95 p-8 shadow-panel backdrop-blur-panel">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-muted">Account</p>
                  <h1 className="mt-3 text-[34px] font-semibold tracking-tight text-text">Manage account</h1>
                  <p className="mt-2 max-w-[440px] text-[14px] leading-6 text-muted">
                    Update your profile details and manage sign-in recovery for your Numo account.
                  </p>
                </div>
                <Link
                  href="/trade"
                  className="rounded-full border border-border/70 bg-panel-2/80 px-4 py-2 text-[13px] font-medium text-text transition hover:bg-panel-2"
                >
                  Back to trading
                </Link>
              </div>

              {isLoading ? (
                <div className="mt-10 rounded-2xl border border-border/60 bg-panel-2/60 px-5 py-4 text-[14px] text-muted">
                  Loading account details...
                </div>
              ) : (
                <form className="mt-10 space-y-8" onSubmit={handleSaveProfile}>
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
                        First name
                      </span>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        className="h-12 w-full rounded-2xl border border-border/70 bg-panel-2/70 px-4 text-[15px] text-text outline-none transition focus:border-white/40"
                        placeholder="First name"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Last name
                      </span>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        className="h-12 w-full rounded-2xl border border-border/70 bg-panel-2/70 px-4 text-[15px] text-text outline-none transition focus:border-white/40"
                        placeholder="Last name"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Email
                    </span>
                    <input
                      type="email"
                      value={accountEmail}
                      readOnly
                      className="h-12 w-full rounded-2xl border border-border/70 bg-panel-2/40 px-4 text-[15px] text-muted outline-none"
                    />
                    <span className="mt-2 block text-[12px] text-muted">
                      Email changes are managed through authentication settings.
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-full bg-white px-5 py-3 text-[14px] font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Save profile"}
                    </button>

                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={isSendingReset}
                      className="rounded-full border border-border/70 bg-panel-2/70 px-5 py-3 text-[14px] font-medium text-text transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSendingReset ? "Sending..." : "Send password reset"}
                    </button>
                  </div>

                  {statusMessage ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-200">
                      {statusMessage}
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
                      {errorMessage}
                    </div>
                  ) : null}
                </form>
              )}
            </div>
          </CardWrapper>
        </ContentLayout>
      </AppLayout>
    </AppBg>
  );
}
