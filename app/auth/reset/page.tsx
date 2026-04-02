"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout, CardWrapper, ContentLayout } from "@/components/layout/page-shell";
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
        setAuthError(decodeURIComponent(errorDescription));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setAuthError(error.message);
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
        setAuthError(error.message);
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
    <AppLayout>
      <ContentLayout variant="auth">
        <CardWrapper size="auth" className="max-w-sm">
          <div className="space-y-5">
            <h1 className="text-[24px] leading-none font-semibold tracking-[-0.02em] text-[#131318]">
              Reset your password
            </h1>

            {!isReady ? (
              <p className="text-[13px] text-[#6f717b]">Preparing password reset...</p>
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
                    className="h-[42px] w-full rounded-[12px] border border-[#e7e7ea] bg-[#efeff2] px-3 text-[13px] text-[#202026] placeholder:text-[#9697a4] focus:outline-none"
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
                    className="h-[42px] w-full rounded-[12px] border border-[#e7e7ea] bg-[#efeff2] px-3 text-[13px] text-[#202026] placeholder:text-[#9697a4] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="h-[42px] w-full rounded-[12px] bg-gradient-to-r from-[#111118] to-[#171722] text-[14px] font-semibold text-[#f2f2f4] shadow-[0_2px_0_rgba(0,0,0,0.08)]"
                >
                  {isBusy ? "Updating..." : "Update password →"}
                </button>
              </form>
            )}

            {statusMessage ? <p className="text-[12px] text-[#4b5d4b]">{statusMessage}</p> : null}
            {authError ? <p className="text-[12px] text-[#b42318]">{authError}</p> : null}

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full text-center text-[13px] font-medium text-[#6f717b] hover:text-[#444551]"
            >
              Back to login
            </button>
          </div>
        </CardWrapper>
      </ContentLayout>
    </AppLayout>
  );
}
