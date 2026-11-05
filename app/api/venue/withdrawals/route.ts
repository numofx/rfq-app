import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// The venue answers once the withdrawal is mined, waiting up to 45 seconds on its executor.
export const maxDuration = 60;

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/** Forwards a signed withdrawal. The venue checks the signature and owner, then pays the gas. */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(`${MARKETS_API_URL}/withdrawals`, {
      body,
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(55_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "cache-control": "no-store", "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    // It may still have gone through: the client says to check the balance rather than sign again.
    console.error("Failed to forward a withdrawal", error);
    return NextResponse.json({ error: "The venue did not answer in time." }, { status: 502 });
  }
}
