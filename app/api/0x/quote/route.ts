import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EXCHANGE_TOKENS } from "@/lib/zeroex";

export const dynamic = "force-dynamic";

// The same 0x Swap API (allowance-holder, v2) swap.numofx.com quotes through. With a taker it is a
// firm quote carrying the transaction; without one it is an indicative price.
const ZEROX_QUOTE_URL = "https://api.0x.org/swap/allowance-holder/quote";
const ZEROX_PRICE_URL = "https://api.0x.org/swap/allowance-holder/price";
const BASE_CHAIN_ID = "8453";

const ALLOWED_TOKENS = new Set(Object.values(EXCHANGE_TOKENS).map(({ address }) => address.toLowerCase()));

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

/**
 * Quotes the exchange between USDC and cNGN on Base. Only that pair is forwarded, so the server's
 * 0x key cannot be used as a general-purpose proxy.
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing ZEROX_API_KEY on the server." }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const sellToken = params.get("sellToken")?.toLowerCase() ?? "";
  const buyToken = params.get("buyToken")?.toLowerCase() ?? "";
  const sellAmount = params.get("sellAmount") ?? "";
  const taker = params.get("taker") ?? "";

  if (!ALLOWED_TOKENS.has(sellToken) || !ALLOWED_TOKENS.has(buyToken) || sellToken === buyToken) {
    return badRequest("Only USDC and cNGN can be exchanged.");
  }
  if (!/^[1-9][0-9]{0,30}$/.test(sellAmount)) {
    return badRequest("sellAmount must be a positive integer in base units.");
  }
  if (taker !== "" && !/^0x[0-9a-fA-F]{40}$/.test(taker)) {
    return badRequest("taker must be an address.");
  }

  const query = new URLSearchParams({ buyToken, chainId: BASE_CHAIN_ID, sellAmount, sellToken });
  if (taker) query.set("taker", taker);

  try {
    const upstream = await fetch(`${taker ? ZEROX_QUOTE_URL : ZEROX_PRICE_URL}?${query.toString()}`, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await upstream.text(), {
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      status: upstream.status,
    });
  } catch {
    return NextResponse.json({ message: "Failed to reach 0x API." }, { status: 502 });
  }
}
