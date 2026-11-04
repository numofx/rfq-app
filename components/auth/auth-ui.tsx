"use client";

import { type InputHTMLAttributes, type ReactNode, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export const authPageClass = "relative overflow-hidden bg-[#F4EFE9] text-[#141414]";
export const authContentClass =
  "relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 pt-6 pb-[max(env(safe-area-inset-bottom),2rem)]";
export const authWidthClass = "max-w-[448px] -translate-y-14 md:-translate-y-16";
export const authFormClass = "mt-[31px] space-y-[17px]";
export const authPrimaryButtonClass =
  "mt-[9px] h-[46px] w-full rounded-full border border-transparent bg-[#141414] text-[15px] font-semibold text-white transition hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70";
export const authLinkClass =
  "font-medium text-[#141414] underline decoration-black/25 underline-offset-4 transition hover:decoration-black";

const LABEL_CLASS = "mb-[5px] block px-1 text-[13px] font-medium leading-5 text-[#141414]";
const FIELD_STATE_CLASS = "border-transparent bg-[#EFE7DC] hover:border-black/10";
const FIELD_INVALID_CLASS = "border-red-500 bg-red-50";

export function AuthCard({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <>
      <div className="rounded-[28px] bg-[#ECE4DA] p-3 sm:rounded-[36px] sm:p-6">
        <div className="relative rounded-[20px] bg-[#FDFBF7] px-6 pt-11 pb-10 sm:px-10">{children}</div>
      </div>
      {below ? <div className="mt-[22px] flex items-baseline justify-center gap-1 text-[14px] text-[#6B645E]">{below}</div> : null}
    </>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <div className="flex justify-center">
        <div className="relative h-7 w-[90px]">
          <Image src="/numo.png" alt="Numo" fill className="object-contain" />
        </div>
      </div>
      <div className="mt-7 space-y-1 text-center">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.04em] text-[#141414]">{title}</h1>
        <p className="text-[15px] text-[#6B645E]">{subtitle}</p>
      </div>
    </>
  );
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  invalid?: boolean;
  errorMessage?: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-2 px-[18px] text-[12px] text-red-500">{message}</p> : null;
}

export function AuthField({ id, label, invalid, errorMessage, ...inputProps }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className={cn(
          "h-[46px] w-full rounded-full border px-[18px] text-[15px] text-[#141414] placeholder:text-[#6B645E] focus:border-black/30 focus:outline-none focus:ring-4 focus:ring-black/[0.04]",
          invalid ? FIELD_INVALID_CLASS : FIELD_STATE_CLASS
        )}
      />
      <FieldError message={errorMessage} />
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  invalid,
  errorMessage,
  action,
  ...inputProps
}: AuthFieldProps & { action?: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div
        className={cn(
          "flex h-[46px] items-center rounded-full border pl-[18px] pr-2 transition-colors focus-within:border-black/30 focus-within:ring-4 focus-within:ring-black/[0.04]",
          invalid ? FIELD_INVALID_CLASS : FIELD_STATE_CLASS
        )}
      >
        <input
          id={id}
          placeholder="••••••••"
          {...inputProps}
          type={isVisible ? "text" : "password"}
          className="h-full w-full bg-transparent text-[15px] text-[#141414] placeholder:tracking-[0.24em] placeholder:text-[#6B645E] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setIsVisible((prev) => !prev)}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B645E] transition hover:bg-black/5 hover:text-[#141414]"
          aria-label={isVisible ? "Hide password" : "Show password"}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
            {isVisible ? <path d="M3 3l18 18" /> : null}
          </svg>
        </button>
      </div>
      <FieldError message={errorMessage} />
      {/* Follows the field in the DOM so Tab reaches the password first, though it sits on the label row. */}
      {action ? <div className="absolute right-1 top-0 text-[13px] leading-5 text-[#6B645E]">{action}</div> : null}
    </div>
  );
}

export function AuthFooter() {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),2rem)]">
      <div className="mx-auto flex w-full max-w-[1200px] items-end justify-between gap-4 text-[12px] text-[#6B645E] sm:text-[13px]">
        <div className="pointer-events-auto flex shrink-0 items-center gap-4">
          <a href="#" className="hover:text-[#141414]">
            Privacy
          </a>
          <a href="#" className="hover:text-[#141414]">
            Cookies
          </a>
        </div>
        <p className="pointer-events-auto text-right">
          © {new Date().getFullYear()} Numo Technologies Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
