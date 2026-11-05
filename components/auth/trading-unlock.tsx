"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLoginWithEmail, usePrivy } from "@privy-io/react-auth";
import { useTradingConfigured } from "@/components/privy-provider";
import { AuthCard, AuthField, AuthHeading, authFormClass, authPrimaryButtonClass } from "@/components/auth/auth-ui";

/**
 * After the password, a code sent to the same email opens the trading wallet (the one the trading
 * app uses for that email). Skipped when this browser already has that wallet open, or when no
 * trading app is configured.
 */
export function TradingUnlock({ email, onDone }: { email: string; onDone: () => void }) {
  const isConfigured = useTradingConfigured();

  useEffect(() => {
    if (!isConfigured) onDone();
  }, [isConfigured, onDone]);

  return isConfigured ? <UnlockWithCode email={email} onDone={onDone} /> : null;
}

function UnlockWithCode({ email, onDone }: { email: string; onDone: () => void }) {
  const { authenticated, ready, user, logout } = usePrivy();
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const hasStarted = useRef(false);
  const privyEmail = user?.email?.address?.toLowerCase() ?? null;
  const isUnlocked = authenticated && privyEmail === email.toLowerCase();

  useEffect(() => {
    if (!ready) return;
    if (isUnlocked) {
      onDone();
      return;
    }
    if (hasStarted.current) return;
    hasStarted.current = true;

    void (async () => {
      // A wallet left open for another email must close before this one can.
      if (authenticated) await logout();
      try {
        await sendCode({ email });
        setIsCodeSent(true);
      } catch {
        setError("We couldn't send a code. Try again, or skip for now.");
      }
    })();
  }, [authenticated, email, isUnlocked, logout, onDone, ready, sendCode]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await loginWithCode({ code });
    } catch {
      setError("That code didn't work. Check it and try again.");
    }
  }

  const isSubmitting = state.status === "submitting-code";

  return (
    <AuthCard
      below={
        <button type="button" onClick={onDone} className="font-medium text-[#6B645E] transition hover:text-[#141414]">
          Skip for now
        </button>
      }
    >
      <AuthHeading title="Check your email" subtitle={`We sent a 6-digit code to ${email} to unlock trading.`} />

      <form className={authFormClass} aria-label="Trading code form" onSubmit={onSubmit}>
        <AuthField
          id="trading-code"
          label="Code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          autoFocus
          value={code}
          invalid={Boolean(error)}
          errorMessage={error || undefined}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
            setError("");
          }}
        />

        <button type="submit" disabled={code.length !== 6 || isSubmitting || !isCodeSent} className={authPrimaryButtonClass}>
          {isSubmitting ? "Verifying..." : isCodeSent ? "Continue" : "Sending code..."}
        </button>
      </form>
    </AuthCard>
  );
}
