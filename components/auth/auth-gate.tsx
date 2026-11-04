"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CenteredLoader } from "@/components/ui/loader";
import { supabase } from "@/lib/supabase/client";

/**
 * Renders its children only for a user Supabase confirms, and sends everyone else to the login page. The session lives
 * in sessionStorage, out of the server's reach, so this has to run in the browser.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      router.replace("/");
      return;
    }

    let isMounted = true;

    async function check(auth: NonNullable<typeof supabase>["auth"]) {
      const { data } = await auth.getUser().catch(() => ({ data: { user: null } }));
      if (!isMounted) return;
      if (data.user) {
        setIsAuthenticated(true);
        return;
      }
      // The login page forwards any stored session back here, so a rejected one has to go first.
      await auth.signOut({ scope: "local" }).catch(() => {});
      router.replace("/");
    }

    void check(client.auth);

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        router.replace("/");
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="bg-[#F6F0E9] dark:bg-[#111111]">
        <CenteredLoader />
      </div>
    );
  }

  return <>{children}</>;
}
