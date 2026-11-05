import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

/** A deposit's status and the account it credited, by the hash of its signed action. */
export async function GET(_request: Request, { params }: { params: { actionHash: string } }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.actionHash)) {
    return NextResponse.json({ error: "invalid action hash" }, { status: 400 });
  }
  try {
    const response = await fetch(`${MARKETS_API_URL}/deposits/${params.actionHash}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "deposit status unavailable" }, { status: 502 });
  }
}
