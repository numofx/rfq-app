"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

// Dynamically import WalletButton with no SSR to ensure Privy is ready
const WalletButton = dynamic(
  () => import("@/components/ui/walletbutton").then((mod) => ({ default: mod.WalletButton })),
  {
    ssr: false,
    loading: () => (
      <Button disabled className="bg-primary text-primary-foreground rounded-full px-6">
        Loading...
      </Button>
    ),
  }
);

interface HeaderProps {
  showWalletButton?: boolean;
  showGoToAppButton?: boolean;
  logoLink?: string;
}

export function Header({
  showWalletButton = false,
  showGoToAppButton = false,
  logoLink = "/",
}: HeaderProps) {
  const isPrivyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

  return (
    <header className="max-w-7xl mx-auto px-6 py-4 lg:px-12 w-full">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Link href={logoLink}>
            <Image src="/numo_logo_white.png" alt="Numo" width={180} height={48} className="h-12" />
          </Link>
        </div>
        <div className="flex-1 flex justify-end">
          {showWalletButton && isPrivyConfigured && <WalletButton />}
          {showGoToAppButton && (
            <Button
              variant="link"
              href="/dashboard"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6"
            >
              Secure Your Rate
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
