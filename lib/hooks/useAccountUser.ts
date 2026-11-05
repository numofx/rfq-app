"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export interface AccountUser {
  email: string;
  firstName: string;
  lastName: string;
  teamName: string;
  createdAt: string | null;
}

/** Signed-in Supabase user, or null while loading or signed out. */
export function useAccountUser(): AccountUser | null {
  const [user, setUser] = useState<AccountUser | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!isMounted || !data.user) return;
        const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
        const firstName = typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
        const lastName = typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
        const teamName = typeof metadata?.team_name === "string" ? metadata.team_name.trim() : "";

        setUser({
          email: data.user.email ?? "",
          firstName,
          lastName,
          teamName: teamName || "Numo",
          createdAt: data.user.created_at ?? null,
        });
      })
      .catch(() => {
        // The dashboard still renders without a name or email.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return user;
}
