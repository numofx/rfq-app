"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout, CardWrapper, ContentLayout } from "@/components/layout/page-shell";
import { getReadableResetError } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorDescription = searchParams.get("error_description");

    const finalize = async () => {
      if (!supabase) {
        setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
        return;
      }

      if (errorDescription) {
        setAuthError(getReadableResetError(decodeURIComponent(errorDescription)));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setAuthError(getReadableResetError(error.message));
          return;
        }
      }

      setIsReady(true);
    };

    void finalize();
  }, [searchParams]);

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setStatusMessage("");

    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }

    if (!newPassword.trim()) {
      setAuthError("Please enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    try {
      setIsBusy(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setAuthError(getReadableResetError(error.message));
        return;
      }
      setStatusMessage("Password updated. You can now log in.");
    } catch (error) {
      setAuthError("Unexpected error while updating your password. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AppLayout showLogoSuffix={false} className="bg-[#F6F0E9] text-[#141414]">
      <ContentLayout variant="auth">
        <CardWrapper size="auth" className="max-w-[420px]">
          <div className="relative space-y-6 rounded-[20px] border border-black/10 bg-[#FFFDFA] px-10 pt-10 pb-8 shadow-[0_0_0_10px_#EDE5DA,0_24px_70px_rgba(60,40,20,0.14)]">
            <h1 className="text-center text-[30px] font-medium leading-tight tracking-[-0.03em] text-[#141414]">
              Reset your password
            </h1>

            {!isReady ? (
              authError ? null : <p className="text-center text-[13px] text-black/55">Preparing password reset...</p>
            ) : (
              <form className="space-y-4" aria-label="Reset password form" onSubmit={handleResetSubmit}>
                <div>
                  <label htmlFor="new-password" className="sr-only">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    placeholder="Enter a new password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="h-12 w-full rounded-full border border-black/10 bg-[#FAF6F0] px-5 text-[14px] text-[#141414] placeholder:text-black/40 hover:border-black/20 focus:outline-none focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="sr-only">
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-12 w-full rounded-full border border-black/10 bg-[#FAF6F0] px-5 text-[14px] text-[#141414] placeholder:text-black/40 hover:border-black/20 focus:outline-none focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="h-12 w-full rounded-full bg-[#141414] text-[14px] font-semibold text-white transition hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isBusy ? "Updating..." : "Update password →"}
                </button>
              </form>
            )}

            {statusMessage ? <p className="text-[12px] text-green-600">{statusMessage}</p> : null}
            {authError ? <p className="text-[12px] text-red-500">{authError}</p> : null}

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full text-center text-[13px] font-medium text-black/55 transition hover:text-[#141414]"
            >
              Back to login
            </button>
          </div>
        </CardWrapper>
      </ContentLayout>
    </AppLayout>
  );
}
