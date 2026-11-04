"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthCard,
  AuthField,
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
import { AppLayout, CardWrapper, ContentLayout, containerClass } from "@/components/layout/page-shell";
import { getReadableAuthError } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase/client";

type View = "login" | "signup" | "password" | "verify" | "team";
type LoginErrorField = "email" | "password" | null;

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

  const switchAuthView = (nextView: "login" | "signup") => {
    setAuthError("");
    setLoginErrorField(null);
    setLoginErrorMessage("");
    setStatusMessage("");
    setAuthDebugInfo("");
    setView(nextView);
  };

  const handleForgotPassword = async () => {
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
          ? authPageClass
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
                ? authContentClass
                : "pt-20"
            }
          >
            <CardWrapper size="auth" className={isPremiumAuthView ? authWidthClass : "max-w-sm"}>
            {view === "login" ? (
              <AuthCard
                below={
                  <>
                    New to Numo?
                    <button type="button" onClick={() => switchAuthView("signup")} className={authLinkClass}>
                      Create an account
                    </button>
                  </>
                }
              >
                <AuthHeading title="Welcome back" subtitle="Lock in exchange rates ahead of time." />

                <form className={authFormClass} aria-label="Login form" onSubmit={handleLoginSubmit}>
                  <AuthField
                    id="email"
                    label="Email"
                    type="email"
                    placeholder="you@company.com"
                    value={loginEmail}
                    invalid={isLoginEmailError}
                    errorMessage={isLoginEmailError ? loginErrorMessage : undefined}
                    onChange={(event) => {
                      setLoginEmail(event.target.value);
                      setAuthError("");
                      setLoginErrorField(null);
                      setLoginErrorMessage("");
                      setAuthDebugInfo("");
                    }}
                  />

                  <AuthPasswordField
                    id="password"
                    label="Password"
                    value={loginPassword}
                    invalid={isLoginPasswordError}
                    errorMessage={isLoginPasswordError ? loginErrorMessage : undefined}
                    onChange={(event) => {
                      setLoginPassword(event.target.value);
                      setAuthError("");
                      setLoginErrorField(null);
                      setLoginErrorMessage("");
                      setAuthDebugInfo("");
                    }}
                    action={
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="transition hover:text-[#141414]"
                      >
                        Forgot password?
                      </button>
                    }
                  />

                  <button type="submit" disabled={isAuthBusy} className={authPrimaryButtonClass}>
                    Log in
                  </button>
                </form>

                {authError ? <p className="mt-4 text-center text-[12px] text-red-500">{authError}</p> : null}
                {statusMessage ? <p className="mt-4 text-center text-[12px] text-[#6B645E]">{statusMessage}</p> : null}
                {authDebugInfo ? <p className="mt-2 text-[11px] text-amber-600/90">{authDebugInfo}</p> : null}
              </AuthCard>
            ) : view === "signup" ? (
              <AuthCard
                below={
                  <>
                    Already have an account?
                    <button type="button" onClick={() => switchAuthView("login")} className={authLinkClass}>
                      Log in
                    </button>
                  </>
                }
              >
                <AuthHeading title="Create your account" subtitle="Lock in exchange rates ahead of time." />

                <form className={authFormClass} aria-label="Sign up form" onSubmit={handleSignupSubmit}>
                  <div className="grid grid-cols-1 gap-[17px] sm:grid-cols-2 sm:gap-3">
                    <AuthField
                      id="first-name"
                      label="First name"
                      type="text"
                      placeholder="Jane"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                    />
                    <AuthField
                      id="last-name"
                      label="Last name"
                      type="text"
                      placeholder="Smith"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                    />
                  </div>

                  <AuthField
                    id="signup-email"
                    label="Email"
                    type="email"
                    placeholder="you@company.com"
                    value={signupEmail}
                    disabled={isAuthBusy}
                    invalid={Boolean(authError)}
                    onChange={(event) => {
                      setSignupEmail(event.target.value);
                      setAuthError("");
                    }}
                  />

                  <button type="submit" disabled={isAuthBusy} className={authPrimaryButtonClass}>
                    {isAuthBusy ? "Checking..." : "Create account"}
                  </button>
                </form>

                {authError ? <p className="mt-4 text-center text-[12px] text-red-500">{authError}</p> : null}
              </AuthCard>
            ) : view === "verify" ? (
              <AuthCard>
                <AuthHeading title="Verify your email" subtitle="Confirm your address to finish account setup." />

                <p className="mt-6 text-center text-[14px] leading-[1.6] text-[#6B645E]">
                  Check{" "}
                  <span className="font-semibold text-[#141414]">{signupEmail.trim() || "your inbox"}</span>{" "}
                  for the verification link, then return here to continue.
                </p>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  className={`${authPrimaryButtonClass} !mt-6`}
                >
                  Resend verification email
                </button>

                <button
                  type="button"
                  onClick={handleVerificationContinue}
                  className="mt-4 w-full text-center text-[13px] font-medium text-[#6B645E] transition hover:text-[#141414]"
                >
                  I&apos;ve verified &mdash; continue
                </button>

                {statusMessage ? <p className="mt-4 text-center text-[12px] text-green-600">{statusMessage}</p> : null}
                {authError ? <p className="mt-4 text-center text-[12px] text-red-500">{authError}</p> : null}
              </AuthCard>
            ) : (
              <AuthCard>
                <button
                  type="button"
                  onClick={() => setView("signup")}
                  className="absolute left-5 top-5 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#EFE7DC] text-[16px] text-[#6B645E] transition hover:text-[#141414]"
                  aria-label="Back to sign up"
                >
                  &larr;
                </button>

                <AuthHeading title="Create your password" subtitle="Finish setting up your Numo account." />

                <form className={authFormClass} aria-label="Create password form" onSubmit={handlePasswordSubmit}>
                  <AuthPasswordField
                    id="new-password"
                    label="Password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />

                  <button type="submit" disabled={isAuthBusy} className={authPrimaryButtonClass}>
                    {isAuthBusy ? "Creating..." : "Continue"}
                  </button>
                </form>

                {authError ? <p className="mt-4 text-center text-[12px] text-red-500">{authError}</p> : null}
                {statusMessage ? <p className="mt-4 text-center text-[12px] text-green-600">{statusMessage}</p> : null}
              </AuthCard>
            )}
            </CardWrapper>
          </ContentLayout>

          {isPremiumAuthView ? (
            <AuthFooter />
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
