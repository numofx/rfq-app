import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const containerClass = "mx-auto w-full max-w-[1200px] px-6";

const headerHeightClass = "h-16";

interface AppLayoutProps {
  children: React.ReactNode;
  headerLeft?: React.ReactNode;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  logoLink?: string;
  logoSrc?: string;
  hideLogo?: boolean;
  showLogoSuffix?: boolean;
  logoSize?: "default" | "large";
  className?: string;
}

export function AppLayout({
  children,
  headerLeft,
  headerCenter,
  headerRight,
  logoLink = "/",
  logoSrc = "/numo_logo_white.png",
  hideLogo = false,
  showLogoSuffix = true,
  logoSize = "default",
  className,
}: AppLayoutProps) {
  const logoContainerClass = logoSize === "large" ? "-mr-8 h-[39px] w-[142px]" : "-mr-6 h-[31px] w-[114px]";
  return (
    <div className={cn("min-h-screen bg-bg text-text", className)}>
      <div className="flex min-h-screen flex-col">
        <header className={cn(headerHeightClass, "relative z-50 shrink-0")}>
          <div className={cn(containerClass, "relative flex h-full items-center translate-y-6")}>
          <div className="flex items-center gap-4">
            {hideLogo ? null : (
              <Link href={logoLink} className="shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn("relative", logoContainerClass)}>
                    <Image src={logoSrc} alt="Numo" fill className="object-contain object-left" priority />
                  </div>
                  {showLogoSuffix ? (
                    <>
                      <div className="ml-0.5 mr-1 h-6 w-px bg-border/70" />
                      <p className="text-[20px] leading-none font-normal tracking-[-0.02em] text-text">Dashboard</p>
                    </>
                  ) : null}
                </div>
              </Link>
            )}
            {headerLeft ? <div>{headerLeft}</div> : null}
          </div>

          {headerCenter ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="pointer-events-auto">{headerCenter}</div>
            </div>
          ) : null}

          {headerRight ? <div className="ml-auto">{headerRight}</div> : null}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

type ContentVariant = "default" | "rfq" | "auth";

interface ContentLayoutProps {
  children: React.ReactNode;
  variant?: ContentVariant;
  className?: string;
}

const contentVariantClass: Record<ContentVariant, string> = {
  default: "pt-4 pb-8",
  rfq: "flex justify-center pt-16 pb-8",
  auth: "flex flex-1 items-start justify-center pt-14 pb-12",
};

export function ContentLayout({ children, variant = "default", className }: ContentLayoutProps) {
  return (
    <main
      className={cn(
        containerClass,
        "flex-1",
        contentVariantClass[variant],
        className
      )}
    >
      {children}
    </main>
  );
}

type CardSize = "ticket" | "auth";

interface CardWrapperProps {
  children: React.ReactNode;
  size?: CardSize;
  className?: string;
}

const cardWidthClass: Record<CardSize, string> = {
  ticket: "max-w-[380px]",
  auth: "max-w-[340px]",
};

export function CardWrapper({ children, size = "ticket", className }: CardWrapperProps) {
  return <section className={cn("w-full", cardWidthClass[size], className)}>{children}</section>;
}
