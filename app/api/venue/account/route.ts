import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/** The subaccount's initial-margin surplus in USD, read on chain by the venue. */
export async function GET(request: Request) {
  const subaccountId = new URL(request.url).searchParams.get("subaccount_id") ?? "";
  if (!/^\d+$/.test(subaccountId)) {
    return NextResponse.json({ error: "subaccount_id must be an unsigned integer" }, { status: 400 });
  }
  try {
    const response = await fetch(`${MARKETS_API_URL}/positions?subaccount_id=${subaccountId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`positions responded ${response.status}`);
    const body = (await response.json()) as { futures_account?: { im_surplus_usd?: string } };
    const surplus = Number(body.futures_account?.im_surplus_usd);
    return NextResponse.json(
      { imSurplusUsd: Number.isFinite(surplus) ? surplus : null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to read positions", error);
    return NextResponse.json({ error: "account unavailable" }, { status: 502 });
  }
}
