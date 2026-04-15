import { NextRequest, NextResponse } from "next/server";

type RfqPair = "USDC/cNGN";
type RfqSide = "BUY" | "SELL";
type Settlement = "cNGN" | "NGN" | "Bank Transfer";

interface RfqRequestBody {
  pair?: RfqPair;
  side?: RfqSide;
  sizeUsd?: number;
  settlement?: Settlement;
}

interface NormalizedQuote {
  quoteId: string;
  price: number;
  sizeUsd: number;
  ttlSeconds: number;
  expiresAt: string;
}

const MIN_SIZE_USD = 10_000;
const MIN_TTL_SECONDS = 15;
const MAX_TTL_SECONDS = 30;
const DEFAULT_TTL_SECONDS = 20;
const DEFAULT_BASE_URL = "https://beta.stablesrail.io";
const DEFAULT_SWAP_QUOTE_PATH = "/v1/swap/quote";

function clampTtl(ttlCandidate?: number): number {
  const candidate = Number.isFinite(ttlCandidate) ? Number(ttlCandidate) : DEFAULT_TTL_SECONDS;
  if (candidate < MIN_TTL_SECONDS) return MIN_TTL_SECONDS;
  if (candidate > MAX_TTL_SECONDS) return MAX_TTL_SECONDS;
  return Math.floor(candidate);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeQuote(upstream: unknown, fallbackSize: number): NormalizedQuote | null {
  if (!upstream || typeof upstream !== "object") {
    return null;
  }

  const payload = upstream as Record<string, unknown>;
  const quoteId =
    (typeof payload.quoteId === "string" && payload.quoteId) ||
    (typeof payload.id === "string" && payload.id) ||
    (typeof payload.quote_id === "string" && payload.quote_id) ||
    null;

  const inputAmount = toNumber(payload.inputAmount) ?? toNumber(payload.amountIn);
  const outputAmount = toNumber(payload.outputAmount) ?? toNumber(payload.amountOut);
  const derivedPrice =
    inputAmount && outputAmount && inputAmount > 0 ? outputAmount / inputAmount : null;
  const price =
    toNumber(payload.price) ??
    toNumber(payload.rate) ??
    toNumber(payload.quoteRate) ??
    toNumber(payload.fxRate) ??
    derivedPrice;
  const sizeUsd =
    toNumber(payload.sizeUsd) ??
    toNumber(payload.baseAmount) ??
    toNumber(payload.amount) ??
    toNumber(payload.size) ??
    inputAmount ??
    fallbackSize;

  const explicitExpiry =
    toIsoDateOrNull(payload.expiresAt) ??
    toIsoDateOrNull(payload.expiryAt) ??
    toIsoDateOrNull(payload.validUntil);
  const ttlFromExpiry = explicitExpiry
    ? Math.floor((new Date(explicitExpiry).getTime() - Date.now()) / 1000)
    : null;
  const ttlSeconds = clampTtl(
    toNumber(payload.ttlSeconds) ??
      toNumber(payload.ttl_seconds) ??
      toNumber(payload.validitySeconds) ??
      toNumber(payload.expiresIn) ??
      ttlFromExpiry ??
      undefined
  );

  if (!quoteId || !price || price <= 0 || !sizeUsd || sizeUsd <= 0) {
    return null;
  }

  const expiresAt = explicitExpiry ?? new Date(Date.now() + ttlSeconds * 1000).toISOString();

  return {
    quoteId,
    price,
    sizeUsd,
    ttlSeconds,
    expiresAt,
  };
}

function unwrapStablesrailPayload(responseBody: unknown): unknown {
  if (!responseBody || typeof responseBody !== "object") {
    return responseBody;
  }

  const payload = responseBody as Record<string, unknown>;
  const data = payload.data;
  const status = payload.status;
  const isWrapped = typeof status === "string" && "data" in payload;

  if (!isWrapped) {
    return responseBody;
  }

  if (typeof status === "string" && status.toLowerCase() === "error") {
    return responseBody;
  }

  return data;
}

export async function POST(request: NextRequest) {
  let body: RfqRequestBody;

  try {
    body = (await request.json()) as RfqRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pair = body.pair;
  const side = body.side;
  const sizeUsd = Number(body.sizeUsd);
  const settlement = body.settlement;

  if (pair !== "USDC/cNGN") {
    return NextResponse.json({ error: "Pair must be USDC/cNGN." }, { status: 400 });
  }

  if (side !== "BUY" && side !== "SELL") {
    return NextResponse.json({ error: "Side must be BUY or SELL." }, { status: 400 });
  }

  if (!Number.isFinite(sizeUsd) || sizeUsd < MIN_SIZE_USD) {
    return NextResponse.json({ error: "Minimum size is $10,000." }, { status: 400 });
  }

  if (settlement !== "cNGN" && settlement !== "NGN" && settlement !== "Bank Transfer") {
    return NextResponse.json({ error: "Settlement must be cNGN, NGN, or Bank Transfer." }, { status: 400 });
  }

  const baseUrl = process.env.STABLESRAIL_BASE_URL || DEFAULT_BASE_URL;
  const quotePath = process.env.STABLESRAIL_SWAP_QUOTE_PATH || DEFAULT_SWAP_QUOTE_PATH;
  const rfqUrl =
    process.env.STABLESRAIL_RFQ_URL ||
    `${baseUrl.replace(/\/$/, "")}/${quotePath.replace(/^\//, "")}`;
  const apiKey = process.env.STABLESRAIL_API_KEY;

  if (!rfqUrl) {
    return NextResponse.json(
      { error: "Missing STABLESRAIL_RFQ_URL. Configure Stablesrail RFQ endpoint." },
      { status: 500 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.STABLESRAIL_RFQ_TIMEOUT_MS || 12_000);
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 12_000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "*/*",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const baseTicker = "USDC";
    const quoteTicker = "CNGN";
    const sideNormalized = side.toLowerCase();
    const fromTicker = side === "SELL" ? baseTicker : quoteTicker;
    const toTicker = side === "SELL" ? quoteTicker : baseTicker;

    // Stablesrail swap quote integration:
    // We send a superset of common swap quote field names so this route
    // remains compatible with slight backend naming differences.
    const requestPayload = {
      pair: "USDC/CNGN",
      side: sideNormalized,
      amount: sizeUsd,
      baseAmount: sizeUsd,
      inputAmount: sizeUsd,
      baseTicker,
      quoteTicker,
      fromTicker,
      toTicker,
      sourceAsset: fromTicker,
      destinationAsset: toTicker,
      settlement,
    };

    const upstreamResponse = await fetch(rfqUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const rawBody = (await upstreamResponse.json()) as unknown;
    const maybeWrappedBody = rawBody as Record<string, unknown> | null;

    if (!upstreamResponse.ok || maybeWrappedBody?.status === "error") {
      const message =
        typeof maybeWrappedBody?.message === "string"
          ? maybeWrappedBody.message
          : typeof rawBody === "object" && rawBody && "error" in rawBody
            ? String((rawBody as { error: unknown }).error)
            : "Failed to request quote from Stablesrail.";

      return NextResponse.json({ error: message }, { status: upstreamResponse.status });
    }

    const unwrappedPayload = unwrapStablesrailPayload(rawBody);
    const normalized = normalizeQuote(unwrappedPayload, sizeUsd);
    if (!normalized) {
      return NextResponse.json({ error: "Unexpected quote response from Stablesrail." }, { status: 502 });
    }

    return NextResponse.json({ quote: normalized }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request quote from Stablesrail.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
