import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/**
 * Forwards a signed order to the venue, which sends no CORS headers. The browser signs; this only
 * relays the body, and the venue verifies the signature against the order's own fields.
 */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(`${MARKETS_API_URL}/orders`, {
      body,
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    console.error("Failed to forward an order", error);
    return NextResponse.json({ error: "The venue could not be reached. Nothing was placed." }, { status: 502 });
  }
}
