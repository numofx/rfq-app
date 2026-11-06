import { NextResponse } from "next/server";
import type { FuturePosition, PositionsResponse } from "@/lib/venue/positions";

export const dynamic = "force-dynamic";

const MARKETS_API_URL = process.env.MARKETS_API_URL || "https://api.numofx.com";

type VenueFuture = {
  market?: string;
  status?: string;
  contracts?: string;
  side?: string;
  notional_usdc?: string;
  mark_price?: string;
  mark_updated_at?: string;
  pending_vm_usdc?: string;
};
type VenuePositions = {
  futures?: VenueFuture[];
  futures_account?: { im_surplus_usd?: string; mm_surplus_usd?: string };
};
type Listing = { market?: string; contract_multiplier?: string; expiry_timestamp?: number; future?: { contract_size?: string } };

const finite = (value: unknown) => {
  const number = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isFinite(number) ? number : null;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MARKETS_API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  return (await response.json()) as T;
}

/** The subaccount's open futures and its margin surpluses, as the venue reads them on chain. */
export async function GET(request: Request) {
  const subaccountId = new URL(request.url).searchParams.get("subaccount_id") ?? "";
  if (!/^\d+$/.test(subaccountId)) {
    return NextResponse.json({ error: "subaccount_id must be an unsigned integer" }, { status: 400 });
  }
  try {
    const [body, listings] = await Promise.all([
      fetchJson<VenuePositions>(`/positions?subaccount_id=${subaccountId}`),
      fetchJson<Listing[]>("/markets"),
    ]);

    const futures: FuturePosition[] = [];
    for (const row of body.futures ?? []) {
      const contracts = finite(row.contracts);
      const listing = listings.find(({ market }) => market === row.market);
      const contractSize = finite(listing?.future?.contract_size);
      const markPrice = finite(row.mark_price);
      if (!row.market || contracts === null || contracts === 0 || contractSize === null || markPrice === null) continue;
      const cngn = Math.abs(contracts) * contractSize;
      futures.push({
        market: row.market,
        status: row.status ?? "trading",
        side: row.side === "short" || contracts < 0 ? "short" : "long",
        contracts: Math.abs(contracts),
        cngn,
        notionalUsdc: Math.abs(finite(row.notional_usdc) ?? cngn * markPrice),
        markPrice,
        markUpdatedAt: row.mark_updated_at ?? null,
        pendingVmUsdc: finite(row.pending_vm_usdc) ?? 0,
        expiresAt: typeof listing?.expiry_timestamp === "number" ? listing.expiry_timestamp : null,
      });
    }

    const payload: PositionsResponse = {
      futures,
      imSurplusUsd: finite(body.futures_account?.im_surplus_usd),
      mmSurplusUsd: finite(body.futures_account?.mm_surplus_usd),
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read positions", error);
    return NextResponse.json({ error: "positions unavailable" }, { status: 502 });
  }
}
