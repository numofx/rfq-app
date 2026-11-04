import type React from "react";
import { AuthGate } from "@/components/auth/auth-gate";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
