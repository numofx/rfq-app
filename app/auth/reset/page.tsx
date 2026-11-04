"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthCard,
  AuthFooter,
  AuthHeading,
  AuthPasswordField,
  authContentClass,
  authFormClass,
  authLinkClass,
  authPageClass,
  authPrimaryButtonClass,
  authWidthClass,
} from "@/components/auth/auth-ui";
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
    <AppLayout hideLogo className={authPageClass}>
      <ContentLayout variant="auth" className={authContentClass}>
        <CardWrapper size="auth" className={authWidthClass}>
          <AuthCard
            below={
              <button type="button" onClick={() => router.push("/")} className={authLinkClass}>
                Back to login
              </button>
            }
          >
            <AuthHeading title="Reset your password" subtitle="Choose a new password for your account." />

            {!isReady ? (
              authError ? null : (
                <p className="mt-6 text-center text-[13px] text-[#6B645E]">Preparing password reset...</p>
              )
            ) : (
              <form className={authFormClass} aria-label="Reset password form" onSubmit={handleResetSubmit}>
                <AuthPasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />

                <AuthPasswordField
                  id="confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />

                <button type="submit" disabled={isBusy} className={authPrimaryButtonClass}>
                  {isBusy ? "Updating..." : "Update password"}
                </button>
              </form>
            )}

            {statusMessage ? <p className="mt-4 text-center text-[12px] text-green-600">{statusMessage}</p> : null}
            {authError ? <p className="mt-4 text-center text-[12px] text-red-500">{authError}</p> : null}
          </AuthCard>
        </CardWrapper>
      </ContentLayout>
      <AuthFooter />
    </AppLayout>
  );
}
