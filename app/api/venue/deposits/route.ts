import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// The venue answers once the deposit is mined, which can take most of a minute.
export const maxDuration = 60;

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/** Forwards a signed deposit. The venue verifies the signatures and pays the gas. */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(`${MARKETS_API_URL}/deposits`, {
      body,
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(55_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    // The deposit may still have gone through: the client reads its record instead of re-signing.
    console.error("Failed to forward a deposit", error);
    return NextResponse.json({ error: "The venue did not answer in time." }, { status: 502 });
  }
}
