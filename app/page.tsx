"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout, CardWrapper, ContentLayout, containerClass } from "@/components/layout/page-shell";
import { supabase } from "@/lib/supabase/client";

type View = "login" | "signup" | "password" | "verify" | "team";
type LoginErrorField = "email" | "password" | null;

const getReadableAuthError = (message: string) => {
  const normalized = message.toLowerCase();
  const domainNotVerifiedMatch = message.match(/550 The ([^ ]+) domain is not verified/i);

  if (domainNotVerifiedMatch) {
    const failedDomain = domainNotVerifiedMatch[1];
    return `Email sender domain mismatch: ${failedDomain} is not verified in Resend. In Supabase Auth email settings, use a sender from your verified domain/subdomain (for example @noreply.numofx.com), or verify ${failedDomain} in Resend.`;
  }

  if (normalized.includes("confirmation email") || normalized.includes("smtp")) {
    return "We couldn't send the verification email. Check your Supabase Auth email provider/SMTP settings and try again.";
  }
  if (normalized.includes("rate limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (normalized.includes("network")) {
    return "Network error while reaching authentication services. Please try again.";
  }

  return message;
};

const getAuthRedirectUrl = () => {
  const explicitRedirectUrl = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (explicitRedirectUrl) {
    return explicitRedirectUrl;
  }

  const origin = window.location.origin;
  if (origin === "http://app.numofx.com") {
    return "https://app.numofx.com/auth/callback";
  }

  return `${origin}/auth/callback`;
};

type CheckEmailResult = {
  exists: boolean;
  reason?: string;
  error?: string;
  detail?: string;
};

const checkEmailExists = async (email: string): Promise<CheckEmailResult> => {
  const response = await fetch("/api/auth/check-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const payload = (await response.json()) as CheckEmailResult;

  if (!response.ok) {
    return {
      exists: false,
      reason: payload.reason ?? "lookup_failed",
      error: payload.error ?? "Failed to check email.",
      detail: payload.detail,
    };
  }

  return {
    exists: Boolean(payload.exists),
    reason: payload.reason ?? "ok",
    error: payload.error,
    detail: payload.detail,
  };
};

const getDevAuthDiagnostic = (error: unknown) => {
  if (process.env.NODE_ENV === "production") {
    return "";
  }

  if (!error || typeof error !== "object") {
    return String(error);
  }

  const details = error as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
    __isAuthError?: boolean;
  };

  return [
    details.name ? `name=${details.name}` : null,
    details.code ? `code=${details.code}` : null,
    typeof details.status === "number" ? `status=${details.status}` : null,
    details.__isAuthError ? "__isAuthError=true" : null,
    details.message ? `message=${details.message}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
};

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();
  const [view, setView] = useState<View>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [isBusinessMenuOpen, setIsBusinessMenuOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState("");
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const [contactValue, setContactValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginErrorField, setLoginErrorField] = useState<LoginErrorField>(null);
  const [loginErrorMessage, setLoginErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authDebugInfo, setAuthDebugInfo] = useState("");
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const isLoginEmailError = view === "login" && loginErrorField === "email";
  const isLoginPasswordError = view === "login" && loginErrorField === "password";

  useEffect(() => {
    const verified = searchParams.get("verified");
    if (!verified) return;
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          setView("team");
        }
      })
      .catch(() => {
        setAuthError("We couldn’t confirm your session yet. Please try again.");
      });
  }, [searchParams]);

  useEffect(() => {
    const verified = searchParams.get("verified");
    if (verified || !supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [router, searchParams]);

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

        setAccountName(fullName || fallbackName);
        setAccountEmail(user.email ?? "");
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
    setView("login");
  };

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAuthBusy) return;
    setAuthError("");
    setStatusMessage("");
    setAuthDebugInfo("");
    if (!signupEmail.trim()) {
      setAuthError("Please enter your email address.");
      return;
    }

    try {
      setIsAuthBusy(true);
      const result = await checkEmailExists(signupEmail.trim());
      if (result.reason !== "ok") {
        setAuthError(result.error ?? "We couldn't verify this email right now. If you already have an account, please log in.");
        setAuthDebugInfo(result.detail ?? result.reason ?? "");
        return;
      }
      if (result.exists) {
        setAuthError("This email is already registered. Please log in.");
        return;
      }
    } catch {
      setAuthError("We couldn't verify this email right now. If you already have an account, please log in.");
      return;
    } finally {
      setIsAuthBusy(false);
    }

    setView("password");
  };

  const handleForgotPassword = async () => {
    setAuthError("");
    setStatusMessage("");
    setAuthDebugInfo("");
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }
    if (!loginEmail.trim()) {
      setAuthError("Please enter your email address.");
      return;
    }

    try {
      setIsAuthBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) {
        setAuthError(getReadableAuthError(error.message));
        setAuthDebugInfo(getDevAuthDiagnostic(error));
        if (process.env.NODE_ENV !== "production") {
          console.error("Supabase resetPasswordForEmail error:", error);
        }
        return;
      }
      setStatusMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setAuthError("Unexpected error while sending the reset email. Please try again.");
      setAuthDebugInfo(getDevAuthDiagnostic(error));
      if (process.env.NODE_ENV !== "production") {
        console.error("Unexpected resetPasswordForEmail failure:", error);
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setLoginErrorField(null);
    setLoginErrorMessage("");
    setStatusMessage("");
    setAuthDebugInfo("");
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }

    if (!loginEmail.trim()) {
      setLoginErrorField("email");
      setLoginErrorMessage("Please enter your email address.");
      return;
    }
    if (!loginPassword.trim()) {
      setLoginErrorField("password");
      setLoginErrorMessage("Please enter your password.");
      return;
    }

    try {
      setIsAuthBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        setAuthDebugInfo(getDevAuthDiagnostic(error));
        const code = (error.code ?? "").toLowerCase();
        const message = error.message.toLowerCase();
        const isInvalidEmail =
          code.includes("email_not_found") ||
          code.includes("user_not_found") ||
          message.includes("email not found") ||
          message.includes("user not found") ||
          message.includes("no user");
        const isInvalidPassword =
          code === "invalid_credentials" ||
          code === "invalid_grant" ||
          message.includes("invalid login credentials") ||
          message.includes("invalid credentials") ||
          message.includes("invalid password");
        const isEmailNotConfirmed = code.includes("email_not_confirmed") || message.includes("email not confirmed");

        if (isInvalidEmail) {
          setLoginErrorField("email");
          setLoginErrorMessage("No account exists for this email address.");
        } else if (isEmailNotConfirmed) {
          setAuthError("This account exists, but the email address has not been confirmed yet.");
        } else if (isInvalidPassword) {
          const result = await checkEmailExists(loginEmail.trim());
          if (result.reason === "ok") {
            if (result.exists) {
              setLoginErrorField("password");
              setLoginErrorMessage("This account exists, but the password you entered is incorrect.");
            } else {
              setLoginErrorField("email");
              setLoginErrorMessage("No account exists for this email address.");
            }
          } else {
            setAuthError(
              result.error ??
                "Supabase rejected the password login, and the app could not verify whether this email has an account."
            );
            setAuthDebugInfo(result.detail ?? result.reason ?? getDevAuthDiagnostic(error));
          }
        } else {
          setAuthError(getReadableAuthError(error.message));
        }
        if (process.env.NODE_ENV !== "production") {
          console.error("Supabase signIn error:", error);
        }
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      setLoginErrorField("password");
      setLoginErrorMessage("Invalid password");
      setAuthDebugInfo(getDevAuthDiagnostic(error));
      if (process.env.NODE_ENV !== "production") {
        console.error("Unexpected signIn failure:", error);
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setStatusMessage("");
    setAuthDebugInfo("");
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }

    if (!signupEmail.trim()) {
      setAuthError("Please enter your email address.");
      return;
    }
    if (!newPassword.trim()) {
      setAuthError("Please create a password.");
      return;
    }

    try {
      setIsAuthBusy(true);
      const { error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
        password: newPassword,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) {
        setAuthError(getReadableAuthError(error.message));
        setAuthDebugInfo(getDevAuthDiagnostic(error));
        if (process.env.NODE_ENV !== "production") {
          console.error("Supabase signUp error:", error);
        }
        return;
      }

      setView("verify");
    } catch (error) {
      setAuthError("Unexpected error while creating your account. Please try again.");
      setAuthDebugInfo(getDevAuthDiagnostic(error));
      if (process.env.NODE_ENV !== "production") {
        console.error("Unexpected signUp failure:", error);
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleVerificationContinue = async () => {
    setAuthError("");
    setAuthDebugInfo("");
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setView("team");
      return;
    }
    setAuthError("We couldn’t confirm your email yet. Please check your inbox.");
  };

  const handleResendVerification = async () => {
    setAuthError("");
    setStatusMessage("");
    setAuthDebugInfo("");
    if (!supabase) {
      setAuthError("Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
      return;
    }
    if (!signupEmail.trim()) {
      setAuthError("Please enter your email address.");
      return;
    }
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signupEmail.trim(),
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) {
        setAuthError(getReadableAuthError(error.message));
        setAuthDebugInfo(getDevAuthDiagnostic(error));
        if (process.env.NODE_ENV !== "production") {
          console.error("Supabase resend error:", error);
        }
        return;
      }
      setStatusMessage("Verification email sent.");
    } catch (error) {
      setAuthError("Unexpected error while resending verification email. Please try again.");
      setAuthDebugInfo(getDevAuthDiagnostic(error));
      if (process.env.NODE_ENV !== "production") {
        console.error("Unexpected resend failure:", error);
      }
    }
  };

  const headerTabs = null;

  const accountDisplayName = accountName || [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "User";
  const accountDisplayEmail = accountEmail || signupEmail.trim() || loginEmail.trim() || "No email available";
  const isPremiumAuthView =
    view === "login" || view === "signup" || view === "password" || view === "verify";
  const headerRight =
    view === "team" ? (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsAccountMenuOpen((prev) => !prev)}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#e9e9ec] text-[#15151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] hover:bg-[#e2e2e6]"
          aria-label="Open account menu"
          aria-expanded={isAccountMenuOpen}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[28px] w-[28px]"
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
          <div className="absolute right-0 z-30 mt-3 w-[340px] rounded-[24px] border border-[#d9d9de] bg-[#f2f2f4] p-6 shadow-[0_24px_44px_rgba(0,0,0,0.14)]">
            <p className="text-[18px] leading-none font-semibold text-[#15151b]">{accountDisplayEmail}</p>
            <p className="mt-2 text-[15px] font-medium text-[#7b7d88]">{accountDisplayName}</p>

            <div className="mt-5 border-t border-[#d7d8de] pt-4">
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(false)}
                className="block text-[17px] font-medium text-[#15151b] hover:text-[#2b2c33] active:font-semibold"
              >
                Manage account
              </button>

              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(false)}
                className="mt-3 block text-[17px] font-medium text-[#15151b] hover:text-[#2b2c33] active:font-semibold"
              >
                Transaction history
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-3 block text-[17px] font-semibold text-[#c4362c] hover:text-[#ab2e25]"
              >
                Log out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <AppLayout
      headerCenter={headerTabs}
      headerRight={headerRight}
      logoSrc={isPremiumAuthView ? "/numo.png" : "/numo_logo_white.png"}
      hideLogo={isPremiumAuthView}
      showLogoSuffix={false}
      logoSize="large"
      className={
        isPremiumAuthView
          ? "relative overflow-hidden bg-white text-black before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top,_rgba(0,0,0,0.02),_transparent_55%)]"
          : undefined
      }
    >
      {view === "team" ? (
        <>
          <ContentLayout variant="default" className="flex min-h-[calc(100vh-8rem)] items-center justify-center pt-2 pb-16">
            <CardWrapper size="auth" className="max-w-[420px]">
              <div className="space-y-5 rounded-[16px] border border-white/10 bg-[#0b0f14]/80 px-10 pt-10 pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="space-y-1.5">
                  <h1 className="text-3xl font-semibold tracking-tight text-white">Create a team</h1>
                  <p className="text-sm leading-[1.6] text-white/70">
                    You&apos;re creating a team on Numo. You may invite your teammates to collaborate after signup.
                  </p>
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter team name"
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white placeholder:text-white/35 hover:border-white/15 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsBusinessMenuOpen((prev) => !prev)}
                      className={`flex h-12 w-full items-center justify-between rounded-lg border px-3 text-[13px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                        businessType
                          ? "border-white/15 bg-white/5 text-white hover:border-white/20"
                          : "border-white/10 bg-white/5 text-white/45 hover:border-white/15"
                      }`}
                    >
                      <span>
                        {businessType
                          ? businessType === "carry-trader"
                            ? "Carry Trader"
                            : businessType.charAt(0).toUpperCase() + businessType.slice(1)
                          : "What is your business?"}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 transition-transform ${isBusinessMenuOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {isBusinessMenuOpen ? (
                      <div className="absolute left-0 top-[56px] z-20 w-full rounded-[16px] border border-white/10 bg-[#0f141b] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                        <div className="space-y-3 text-[14px] font-medium text-white">
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType("microlender");
                              setIsBusinessMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Microlender
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType("carry-trader");
                              setIsBusinessMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Carry Trader
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType("importer");
                              setIsBusinessMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Importer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType("exporter");
                              setIsBusinessMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Exporter
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBusinessType("other");
                              setIsBusinessMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Other
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsContactMenuOpen((prev) => !prev)}
                      className={`flex h-12 w-full items-center justify-between rounded-lg border px-3 text-[13px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                        contactMethod
                          ? "border-white/15 bg-white/5 text-white hover:border-white/20"
                          : "border-white/10 bg-white/5 text-white/45 hover:border-white/15"
                      }`}
                    >
                      <span>
                        {contactMethod
                          ? contactMethod === "phone"
                            ? "Phone Number"
                            : "Email"
                          : "How should we connect with you?"}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 transition-transform ${isContactMenuOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {isContactMenuOpen ? (
                      <div className="absolute left-0 top-[56px] z-20 w-full rounded-[16px] border border-white/10 bg-[#0f141b] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                        <div className="space-y-3 text-[14px] font-medium text-white">
                          <button
                            type="button"
                            onClick={() => {
                              setContactMethod("email");
                              setContactValue("");
                              setIsContactMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Email
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setContactMethod("phone");
                              setContactValue("");
                              setIsContactMenuOpen(false);
                            }}
                            className="block w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-white/5"
                          >
                            Phone Number
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {contactMethod ? (
                    <input
                      type={contactMethod === "email" ? "email" : "tel"}
                      value={contactValue}
                      onChange={(event) => setContactValue(event.target.value)}
                      placeholder={contactMethod === "email" ? "Enter your email" : "Enter phone number"}
                      className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white placeholder:text-white/35 hover:border-white/15 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="h-12 w-full rounded-lg border border-black/10 bg-white text-[14px] font-semibold text-black shadow-[0_10px_28px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:bg-white/90 active:translate-y-px"
                  >
                    Finish Setup &rarr;
                  </button>
                </div>
              </div>
            </CardWrapper>
          </ContentLayout>

          <footer className="pointer-events-none fixed inset-x-0 bottom-0 px-4 pb-4">
            <div className={`${containerClass} relative flex items-end justify-between text-white/45`}>
              <div className="pointer-events-auto text-left text-[11px] leading-[1.2]">
                <p>Logged in as:</p>
                <p className="mt-1 text-[11px] font-semibold text-white/75">
                  {signupEmail.trim() || "r.leifke@gmail.com"}
                </p>
              </div>

              <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 text-[10px]">
                <div className="flex items-center gap-3">
                  <a href="#" className="transition hover:text-white/70">
                    Privacy Policy
                  </a>
                  <span aria-hidden="true">&middot;</span>
                  <a href="#" className="transition hover:text-white/70">
                    Cookie Policy
                  </a>
                </div>
              </div>

              <button type="button" className="pointer-events-auto text-[14px] text-white/60 transition hover:text-white/80">
                Log out
              </button>
            </div>
          </footer>
        </>
      ) : (
        <>
          <ContentLayout
            variant="auth"
            className={
              isPremiumAuthView
                ? "relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 pt-6 pb-[max(env(safe-area-inset-bottom),2rem)]"
                : "pt-20"
            }
          >
            <CardWrapper
              size="auth"
              className={isPremiumAuthView ? "max-w-[420px] -translate-y-14 md:-translate-y-20" : "max-w-sm"}
            >
            {view === "login" ? (
              <>
                <div className="space-y-5 rounded-[16px] border border-black/5 bg-white px-10 pt-10 pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="relative h-11 w-[160px]">
                        <Image src="/numo.png" alt="Numo" fill className="object-contain" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-black md:text-4xl">
                        Log in
                      </h1>
                      <p className="text-sm text-black/60">Lock in exchange rates ahead of time.</p>
                    </div>
                  </div>

                  <form className="space-y-3" aria-label="Login form" onSubmit={handleLoginSubmit}>
                    <div>
                      <label htmlFor="email" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="email"
                        type="email"
                        placeholder="Enter your email address"
                        value={loginEmail}
                        onChange={(event) => {
                          setLoginEmail(event.target.value);
                          setLoginErrorField(null);
                          setLoginErrorMessage("");
                          setAuthDebugInfo("");
                        }}
                        className={`h-12 w-full rounded-lg border px-3 text-[13px] text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                          isLoginEmailError
                            ? "border-red-500 bg-red-50"
                            : "border-black/10 bg-black/[0.02] hover:border-black/20"
                        }`}
                      />
                      {isLoginEmailError ? <p className="mt-2 text-[12px] text-[#fca5a5]">{loginErrorMessage}</p> : null}
                    </div>

                    <div>
                      <label htmlFor="password" className="sr-only">
                        Password
                      </label>
                      <div
                        className={`flex h-12 items-center rounded-lg border px-3 transition-colors ${
                          isLoginPasswordError
                            ? "border-red-500 bg-red-50"
                            : "border-black/10 bg-black/[0.02] hover:border-black/20 focus-within:border-black/30"
                        }`}
                      >
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={loginPassword}
                          onChange={(event) => {
                            setLoginPassword(event.target.value);
                            setLoginErrorField(null);
                            setLoginErrorMessage("");
                            setAuthDebugInfo("");
                          }}
                          className="h-full w-full bg-transparent text-[13px] text-black placeholder:text-black/40 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="ml-2 flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-black/10 bg-white text-black/60 hover:text-black/80"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[12px] w-[12px]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                            <circle cx="12" cy="12" r="3" />
                            {showPassword ? <path d="M3 3l18 18" /> : null}
                          </svg>
                        </button>
                      </div>
                      {isLoginPasswordError ? (
                        <p className="mt-2 text-[12px] text-[#fca5a5]">{loginErrorMessage}</p>
                      ) : null}
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthBusy}
                      className="h-12 w-full rounded-lg border border-transparent bg-brand/20 text-[14px] font-semibold text-brand transition hover:bg-brand/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Log in
                    </button>
                  </form>

                  {statusMessage ? <p className="text-[12px] text-gray-500">{statusMessage}</p> : null}
                  {authDebugInfo ? <p className="text-[11px] text-amber-600/90">{authDebugInfo}</p> : null}
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="mt-3 w-full text-right text-xs text-black/50 transition hover:text-black"
                  >
                    Forgot your password?
                  </button>
                  <p className="mt-5 flex items-baseline justify-center gap-2">
                    <span className="text-xs text-black/50">New to Numo?</span>
                    <button
                      type="button"
                      onClick={() => setView("signup")}
                      className="text-xs font-medium text-black/80 underline underline-offset-4 transition hover:text-black"
                    >
                      Create account
                    </button>
                  </p>
                </div>
              </>
            ) : view === "signup" ? (
              <>
                <div className="space-y-5 rounded-[16px] border border-black/5 bg-white px-10 pt-10 pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="relative h-11 w-[160px]">
                        <Image src="/numo.png" alt="Numo" fill className="object-contain" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-black md:text-4xl">
                        Create account
                      </h1>
                      <p className="text-sm text-black/60">Lock in exchange rates ahead of time.</p>
                    </div>
                  </div>

                  <form className="space-y-3" aria-label="Sign up form" onSubmit={handleSignupSubmit}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="first-name" className="sr-only">
                          First name
                        </label>
                        <input
                          id="first-name"
                          type="text"
                          placeholder="Enter your first name"
                          value={firstName}
                          onChange={(event) => setFirstName(event.target.value)}
                          className="h-12 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-[13px] text-black placeholder:text-black/40 hover:border-black/20 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                      <div>
                        <label htmlFor="last-name" className="sr-only">
                          Last name
                        </label>
                        <input
                          id="last-name"
                          type="text"
                          placeholder="Enter your last name"
                          value={lastName}
                          onChange={(event) => setLastName(event.target.value)}
                          className="h-12 w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 text-[13px] text-black placeholder:text-black/40 hover:border-black/20 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="signup-email" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        placeholder="Enter your email address"
                        value={signupEmail}
                        disabled={isAuthBusy}
                        onChange={(event) => {
                          setSignupEmail(event.target.value);
                          setAuthError("");
                        }}
                        className={`h-12 w-full rounded-lg border px-3 text-[13px] text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
                          authError ? "border-red-500 bg-red-50" : "border-black/10 bg-black/[0.02] hover:border-black/20"
                        }`}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthBusy}
                      className="h-12 w-full rounded-lg border border-transparent bg-brand/20 text-[14px] font-semibold text-brand transition hover:bg-brand/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isAuthBusy ? "Checking..." : "Create account"}
                    </button>
                  </form>

                  {authError ? <p className="text-[12px] text-red-500">{authError}</p> : null}
                  <p className="mt-5 flex items-baseline justify-center gap-2">
                    <span className="text-xs text-black/50">Already have an account?</span>
                    <button
                      type="button"
                      onClick={() => setView("login")}
                      className="text-xs font-medium text-black/80 underline underline-offset-4 transition hover:text-black"
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </>
            ) : view === "verify" ? (
              <>
                <div className="space-y-5 rounded-[16px] border border-black/5 bg-white px-10 pt-10 pb-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="relative h-11 w-[160px]">
                        <Image src="/numo.png" alt="Numo" fill className="object-contain" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-black md:text-4xl">
                        Verify your email
                      </h1>
                      <p className="text-sm text-black/60">Confirm your address to finish account setup</p>
                    </div>
                  </div>

                  <p className="text-[14px] leading-[1.6] text-black/60">
                    Check{" "}
                    <span className="font-semibold text-black">{signupEmail.trim() || "your inbox"}</span>{" "}
                    for the verification link, then return here to continue.
                  </p>

                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="h-12 w-full rounded-lg border border-transparent bg-brand/20 text-[14px] font-semibold text-brand transition hover:bg-brand/30 active:translate-y-px"
                  >
                    Resend verification email
                  </button>

                  <button
                    type="button"
                    onClick={handleVerificationContinue}
                    className="text-[13px] font-medium text-black/50 transition hover:text-black"
                  >
                    I&apos;ve verified &mdash; continue
                  </button>

                  {statusMessage ? <p className="text-[12px] text-green-600">{statusMessage}</p> : null}
                  {authError ? <p className="text-[12px] text-red-500">{authError}</p> : null}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-5 rounded-[16px] border border-black/5 bg-white px-10 pt-10 pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="relative h-11 w-[160px]">
                        <Image src="/numo.png" alt="Numo" fill className="object-contain" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-black md:text-4xl">
                        Create your password
                      </h1>
                      <p className="text-sm text-black/60">Finish setting up your Numo account</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setView("signup")}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-black/10 bg-black/[0.02] text-[16px] text-black/60 transition hover:bg-black/[0.05]"
                    aria-label="Back to sign up"
                  >
                    &larr;
                  </button>

                  <form className="space-y-4" aria-label="Create password form" onSubmit={handlePasswordSubmit}>
                    <div>
                      <label htmlFor="new-password" className="sr-only">
                        Password
                      </label>
                      <div className="flex h-12 items-center rounded-lg border border-black/10 bg-black/[0.02] px-3 transition-colors hover:border-black/20 focus-within:border-black/30">
                        <input
                          id="new-password"
                          type={showCreatePassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="Enter your password"
                          className="h-full w-full bg-transparent text-[13px] text-black placeholder:text-black/40 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword((prev) => !prev)}
                          className="ml-2 flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-black/10 bg-white text-black/60 hover:text-black/80"
                          aria-label={showCreatePassword ? "Hide password" : "Show password"}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[12px] w-[12px]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                            <circle cx="12" cy="12" r="3" />
                            {showCreatePassword ? <path d="M3 3l18 18" /> : null}
                          </svg>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthBusy}
                      className="h-12 w-full rounded-lg border border-transparent bg-brand/20 text-[14px] font-semibold text-brand transition hover:bg-brand/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isAuthBusy ? "Creating..." : "Continue →"}
                    </button>
                  </form>

                  {authError ? <p className="text-[12px] text-red-500">{authError}</p> : null}
                  {statusMessage ? <p className="text-[12px] text-green-600">{statusMessage}</p> : null}
                </div>
              </>
            )}

            {view !== "login" && view !== "signup" ? (
              <div className="mt-6 text-center text-[12px] leading-[1.35] text-[#8f9099]">
                <p>
                  This site is protected by reCAPTCHA and the
                  <br />
                  Google Privacy Policy and Terms of Service apply.
                </p>
              </div>
            ) : null}

            {view === "login" || view === "signup" ? null : (
              <div className="mt-4 flex justify-center gap-3 text-[12px] text-[#8f9099]">
                <a href="#" className="hover:text-[#70707a]">
                  Privacy Policy
                </a>
                <span aria-hidden="true">&middot;</span>
                <a href="#" className="hover:text-[#70707a]">
                  Cookie Policy
                </a>
              </div>
            )}
            </CardWrapper>
          </ContentLayout>

          {isPremiumAuthView ? (
            <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <div className={`${containerClass} flex items-end justify-between text-[10px] text-black/40`}>
                <div className="pointer-events-auto flex items-center gap-2">
                  <a href="#" className="hover:text-black/60">
                    Privacy
                  </a>
                  <span aria-hidden="true">&middot;</span>
                  <a href="#" className="hover:text-black/60">
                    Cookie
                  </a>
                </div>
                <div className="pointer-events-auto text-right">
                  <p>Numo Technologies Inc.</p>
                  <p>All rights reserved, © Numo {currentYear}.</p>
                </div>
              </div>
            </footer>
          ) : (
            <footer className="border-t border-[#d9dbe2]">
              <div className={`${containerClass} py-10`}>
                <div className="flex flex-col items-start gap-6 text-[#70727b]">
                  <div className="text-[12px] leading-[1.35] md:text-[13px]">
                    <p>Numo Technologies Inc.</p>
                    <p>All rights reserved, © Numo {currentYear}.</p>
                  </div>
                </div>
              </div>
            </footer>
          )}
        </>
      )}
    </AppLayout>
  );
}
