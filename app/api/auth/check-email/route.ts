import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CheckEmailBody = {
  email?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        exists: false,
        reason: "missing_server_config",
        error: "Missing Supabase server configuration. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  let body: CheckEmailBody = {};
  try {
    body = (await request.json()) as CheckEmailBody;
  } catch {
    return NextResponse.json({ exists: false, reason: "invalid_request", error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ exists: false, reason: "missing_email", error: "Email is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json(
      { exists: false, reason: "lookup_failed", error: "Unable to check email.", detail: error.message },
      { status: 500 }
    );
  }

  const exists = Boolean(data?.users?.some((user) => user.email?.trim().toLowerCase() === email));

  return NextResponse.json({ exists, reason: "ok" }, { status: 200 });
}
