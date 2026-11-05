import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/** An order's status, filled amount and cancel reason, from the venue. */
export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  try {
    const response = await fetch(`${MARKETS_API_URL}/orders/${encodeURIComponent(params.orderId)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "order status unavailable" }, { status: 502 });
  }
}
