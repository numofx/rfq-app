"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Panel } from "@/components/ui/panel";
import { PrimaryButton } from "@/components/ui/primary-button";
import { FieldLabel } from "@/components/ui/rfq-primitives";
import { TextField } from "@/components/ui/text-field";

type Pair = "USDC/cNGN";
type Settlement = "cNGN";
type SideMode = "BUY_CNGN" | "SELL_CNGN";
type RFQState = "IDLE" | "REQUESTING" | "QUOTED" | "ACCEPTED" | "ERROR";
type ApiSide = "BUY" | "SELL";

interface SpotQuote {
  quoteId: string;
  price: number;
  sizeUsd: number;
  ttlSeconds: number;
  expiresAt: string;
}

interface QuoteResponse {
  quote: SpotQuote;
  error?: string;
}

const DEFAULT_PAIR: Pair = "USDC/cNGN";
const DEFAULT_SETTLEMENT: Settlement = "cNGN";
const MIN_SIZE_USD = 10_000;
const INDICATIVE_RATE = 1385;
const INDICATIVE_SPREAD = "0.4-1.2%";
const INDICATIVE_RESPONSE = "~5s";
const MOCK_DELAY_MS = 1400;

function formatAmount(value: number, digits = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatRate(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockQuote(sizeUsd: number): SpotQuote {
  const price = 1384.85;
  const ttlSeconds = 20;

  return {
    quoteId: `mock-${Date.now()}`,
    price,
    sizeUsd,
    ttlSeconds,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

function RFQPageHeader() {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted">NUMO / RFQ / USDC-cNGN SPOT</p>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-text">Spot RFQ</h1>
    </div>
  );
}

function SideToggle({ value, onChange, disabled }: { value: SideMode; onChange: (next: SideMode) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-panel-2/60 p-1">
      <button
        type="button"
        onClick={() => onChange("BUY_CNGN")}
        disabled={disabled}
        className={`h-8 rounded-md text-[12px] font-semibold ${
          value === "BUY_CNGN" ? "bg-white text-black" : "text-muted"
        }`}
      >
        Buy cNGN
      </button>
      <button
        type="button"
        onClick={() => onChange("SELL_CNGN")}
        disabled={disabled}
        className={`h-8 rounded-md text-[12px] font-semibold ${
          value === "SELL_CNGN" ? "bg-white text-black" : "text-muted"
        }`}
      >
        Sell cNGN
      </button>
    </div>
  );
}

function NotionalInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="rfq-notional">{label}</FieldLabel>
        <span className="text-[10px] font-semibold text-muted">Min $10,000 equiv.</span>
      </div>
      <div className="relative">
        <TextField
          id="rfq-notional"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="100000"
          disabled={disabled}
          className="h-10 px-7 text-[13px] disabled:opacity-80"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">$</span>
      </div>
    </div>
  );
}

function QuoteSummaryRow() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/70 bg-panel-2/40 px-3 py-2 text-[11px] text-muted">
      <span>
        Indicative <span className="font-semibold text-text">{formatAmount(INDICATIVE_RATE)} cNGN / USDC</span>
      </span>
      <span className="text-muted/70">|</span>
      <span>
        Spread <span className="font-semibold text-text">{INDICATIVE_SPREAD}</span>
      </span>
      <span className="text-muted/70">|</span>
      <span>
        Response <span className="font-semibold text-text">{INDICATIVE_RESPONSE}</span>
      </span>
    </div>
  );
}

function QuoteActionArea({
  state,
  errorMessage,
  quoteSecondsRemaining,
  onRequest,
  onAccept,
  onReject,
}: {
  state: RFQState;
  errorMessage: string | null;
  quoteSecondsRemaining: number;
  onRequest: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  if (state === "QUOTED") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-md border border-border/70 bg-panel-2/50 px-3 py-2 text-[11px]">
          <span className="font-semibold text-muted">Firm quote active</span>
          <span className="font-semibold text-text">Expires in {quoteSecondsRemaining}s</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="h-10 rounded-lg bg-white text-[13px] font-semibold text-black hover:bg-white/90"
          >
            Accept Quote
          </button>
          <button
            type="button"
            onClick={onReject}
            className="h-10 rounded-lg border border-border/70 bg-panel text-[13px] font-semibold text-text hover:bg-panel-2"
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <PrimaryButton
        type="button"
        onClick={onRequest}
        disabled={state === "REQUESTING" || state === "ACCEPTED"}
        className="h-10 w-full text-[14px] font-semibold tracking-[0.01em] disabled:opacity-75"
      >
        {state === "REQUESTING" ? "Requesting Firm Quote..." : state === "ACCEPTED" ? "Quote Accepted" : "Get Firm Quote"}
      </PrimaryButton>
      {errorMessage ? <p className="text-[11px] text-red-200">{errorMessage}</p> : null}
    </div>
  );
}

function RFQTicket({
  side,
  state,
  notionalInput,
  onSideChange,
  onNotionalChange,
  receiveAsset,
  receiveAmount,
  isFirmReceive,
  quoteSecondsRemaining,
  onRequest,
  onAccept,
  onReject,
  errorMessage,
}: {
  side: SideMode;
  state: RFQState;
  notionalInput: string;
  onSideChange: (next: SideMode) => void;
  onNotionalChange: (next: string) => void;
  receiveAsset: "cNGN" | "USDC";
  receiveAmount: number;
  isFirmReceive: boolean;
  quoteSecondsRemaining: number;
  onRequest: () => void;
  onAccept: () => void;
  onReject: () => void;
  errorMessage: string | null;
}) {
  const sendAsset = side === "BUY_CNGN" ? "USDC" : "cNGN";

  return (
    <Panel className="space-y-3 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-text">Request Firm Quote</h2>
      </div>

      <SideToggle value={side} onChange={onSideChange} disabled={state === "REQUESTING" || state === "QUOTED"} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>You send</FieldLabel>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-panel px-3">
            <Image
              src={sendAsset === "USDC" ? "/tokens/usdc.svg" : "/tokens/cngn.svg"}
              alt={`${sendAsset} token`}
              width={16}
              height={16}
              className="h-4 w-4 rounded-full"
            />
            <span className="text-[13px] font-semibold text-text">{sendAsset}</span>
          </div>
        </div>

        <NotionalInput
          value={notionalInput}
          onChange={onNotionalChange}
          label={`${sendAsset} notional`}
          disabled={state === "REQUESTING" || state === "QUOTED"}
        />
      </div>

      <div className="space-y-1">
        <FieldLabel>You receive</FieldLabel>
        <div className="flex h-10 items-center justify-between rounded-lg border border-border/70 bg-panel/70 px-3">
          <span className="flex items-center gap-2">
            <Image
              src={receiveAsset === "USDC" ? "/tokens/usdc.svg" : "/tokens/cngn.svg"}
              alt={`${receiveAsset} token`}
              width={16}
              height={16}
              className="h-4 w-4 rounded-full"
            />
            <span className="text-[13px] font-semibold text-text">{receiveAsset}</span>
          </span>
          <span className="text-[13px] font-semibold text-text">{formatAmount(receiveAmount)}</span>
        </div>
      </div>

      <QuoteSummaryRow />

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted sm:grid-cols-4">
        <span>Min $10k</span>
        <span>Response 2-10s</span>
        <span>Validity 15-30s</span>
        <span>Settlement cNGN or NGN rails</span>
      </div>

      <QuoteActionArea
        state={state}
        errorMessage={errorMessage}
        quoteSecondsRemaining={quoteSecondsRemaining}
        onRequest={onRequest}
        onAccept={onAccept}
        onReject={onReject}
      />
    </Panel>
  );
}

function RFQStatusPanel({
  state,
  quote,
  quoteSecondsRemaining,
  requestingElapsedSeconds,
  side,
}: {
  state: RFQState;
  quote: SpotQuote | null;
  quoteSecondsRemaining: number;
  requestingElapsedSeconds: number;
  side: SideMode;
}) {
  const lifecycleContent = (() => {
    if (state === "REQUESTING") {
      return (
        <>
          <p className="text-[14px] font-semibold text-text">Requesting quote...</p>
          <p className="text-[12px] text-muted">Contacting active liquidity providers</p>
          <div className="h-2 overflow-hidden rounded-full bg-panel/70">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-white/60" />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Elapsed</span>
            <span className="font-semibold text-text">{requestingElapsedSeconds}s</span>
          </div>
        </>
      );
    }

    if (state === "QUOTED" && quote) {
      const receiveAmount = side === "BUY_CNGN" ? quote.sizeUsd * quote.price : quote.sizeUsd;
      const receiveAsset = side === "BUY_CNGN" ? "cNGN" : "USDC";

      return (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-text">Firm quote returned</p>
            <span className="rounded-md border border-border/70 bg-panel px-2 py-1 text-[11px] font-semibold text-text">
              {quoteSecondsRemaining}s
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-[11px]">
            <span className="text-muted">Rate</span>
            <span className="text-right font-semibold text-text">{formatRate(quote.price)} cNGN / USDC</span>
            <span className="text-muted">Output</span>
            <span className="text-right font-semibold text-text">
              {formatAmount(receiveAmount)} {receiveAsset}
            </span>
            <span className="text-muted">Validity</span>
            <span className="text-right text-text">{quoteSecondsRemaining}s remaining</span>
          </div>
        </>
      );
    }

    if (state === "ACCEPTED" && quote) {
      return (
        <>
          <p className="text-[14px] font-semibold text-emerald-100">Quote accepted</p>
          <p className="text-[12px] text-emerald-100/90">Execution in progress. Preparing settlement.</p>
          <div className="grid grid-cols-2 gap-y-1 text-[11px] text-emerald-100/95">
            <span>Quote ID</span>
            <span className="text-right">{quote.quoteId}</span>
            <span>Status</span>
            <span className="text-right">Pending settlement</span>
          </div>
        </>
      );
    }

    return (
      <>
        <p className="text-[14px] font-semibold text-text">No active RFQ</p>
        <p className="text-[12px] text-muted">Enter size and request quote.</p>
      </>
    );
  })();

  return (
    <div className="space-y-3">
      <Panel className="space-y-3 p-4">
        <p className="text-[11px] font-semibold tracking-[0.04em] text-muted">STATUS</p>
        {lifecycleContent}
      </Panel>

      <Panel className="space-y-2 p-4">
        <p className="text-[11px] font-semibold tracking-[0.04em] text-muted">MARKET</p>
        <div className="grid grid-cols-2 gap-y-1 text-[11px]">
          <span className="text-muted">Indicative rate</span>
          <span className="text-right text-text">{formatAmount(INDICATIVE_RATE)} cNGN / USDC</span>
          <span className="text-muted">Size band</span>
          <span className="text-right text-text">$10k to $1M+</span>
          <span className="text-muted">Response time</span>
          <span className="text-right text-text">2-10 seconds</span>
          <span className="text-muted">Validity</span>
          <span className="text-right text-text">15-30 seconds</span>
          <span className="text-muted">Settlement rail</span>
          <span className="text-right text-text">cNGN + NGN payout rails</span>
          <span className="text-muted">Liquidity</span>
          <span className="text-right text-text">Active</span>
        </div>
      </Panel>
    </div>
  );
}

export function RFQInterface() {
  const [state, setState] = useState<RFQState>("IDLE");
  const [pair] = useState<Pair>(DEFAULT_PAIR);
  const [settlement] = useState<Settlement>(DEFAULT_SETTLEMENT);
  const [side, setSide] = useState<SideMode>("BUY_CNGN");
  const [notionalInput, setNotionalInput] = useState("100000");
  const [quote, setQuote] = useState<SpotQuote | null>(null);
  const [quoteSecondsRemaining, setQuoteSecondsRemaining] = useState(0);
  const [requestingElapsedSeconds, setRequestingElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedNotional = useMemo(() => Number(notionalInput.replace(/,/g, "")) || 0, [notionalInput]);
  const requesting = state === "REQUESTING";

  const requestSizeUsd = useMemo(() => {
    if (!parsedNotional || parsedNotional <= 0) return 0;
    return side === "BUY_CNGN" ? parsedNotional : parsedNotional / INDICATIVE_RATE;
  }, [parsedNotional, side]);

  const receiveAsset: "cNGN" | "USDC" = side === "BUY_CNGN" ? "cNGN" : "USDC";

  const receiveAmount = useMemo(() => {
    if (quote && (state === "QUOTED" || state === "ACCEPTED")) {
      return side === "BUY_CNGN" ? quote.sizeUsd * quote.price : quote.sizeUsd;
    }

    if (!parsedNotional || parsedNotional <= 0) return 0;
    return side === "BUY_CNGN" ? parsedNotional * INDICATIVE_RATE : parsedNotional / INDICATIVE_RATE;
  }, [parsedNotional, quote, side, state]);

  useEffect(() => {
    if (!requesting) return;

    const timer = window.setInterval(() => {
      setRequestingElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [requesting]);

  useEffect(() => {
    if (state !== "QUOTED" || !quote) return;

    const tick = () => {
      const ms = new Date(quote.expiresAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.ceil(ms / 1000));
      setQuoteSecondsRemaining(seconds);

      if (seconds <= 0) {
        setState("ERROR");
        setErrorMessage("Firm quote expired. Request a new quote.");
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [quote, state]);

  const resetToIdle = () => {
    setState("IDLE");
    setQuote(null);
    setQuoteSecondsRemaining(0);
    setRequestingElapsedSeconds(0);
  };

  const requestFirmQuote = async () => {
    if (!Number.isFinite(requestSizeUsd) || requestSizeUsd < MIN_SIZE_USD) {
      setState("ERROR");
      setErrorMessage("Minimum size for large spot conversion is $10,000 equivalent.");
      return;
    }

    setState("REQUESTING");
    setQuote(null);
    setQuoteSecondsRemaining(0);
    setRequestingElapsedSeconds(0);
    setErrorMessage(null);

    const apiSide: ApiSide = side === "BUY_CNGN" ? "SELL" : "BUY";

    try {
      const fetchPromise = fetch("/api/rfq/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pair,
          side: apiSide,
          sizeUsd: requestSizeUsd,
          settlement,
        }),
      }).then(async (response) => {
        const data = (await response.json()) as QuoteResponse;
        if (!response.ok || !data.quote) {
          throw new Error(data.error || "Unable to retrieve firm quote.");
        }
        return data.quote;
      });

      const [fetchedQuote] = await Promise.all([fetchPromise, delay(MOCK_DELAY_MS)]);
      setQuote(fetchedQuote);
      setQuoteSecondsRemaining(fetchedQuote.ttlSeconds);
      setState("QUOTED");
    } catch {
      const fallback = createMockQuote(requestSizeUsd);
      await delay(MOCK_DELAY_MS);
      setQuote(fallback);
      setQuoteSecondsRemaining(fallback.ttlSeconds);
      setState("QUOTED");
    }
  };

  const acceptQuote = () => {
    if (!quote) {
      setState("ERROR");
      setErrorMessage("No active quote to accept.");
      return;
    }

    if (new Date(quote.expiresAt).getTime() <= Date.now()) {
      setState("ERROR");
      setErrorMessage("Firm quote expired before acceptance.");
      return;
    }

    setState("ACCEPTED");
  };

  const rejectQuote = () => {
    resetToIdle();
  };

  return (
    <div className="w-full max-w-[1000px] space-y-3">
      <RFQPageHeader />

      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <RFQTicket
          side={side}
          state={state}
          notionalInput={notionalInput}
          onSideChange={setSide}
          onNotionalChange={setNotionalInput}
          receiveAsset={receiveAsset}
          receiveAmount={receiveAmount}
          isFirmReceive={Boolean(quote && (state === "QUOTED" || state === "ACCEPTED"))}
          quoteSecondsRemaining={quoteSecondsRemaining}
          onRequest={requestFirmQuote}
          onAccept={acceptQuote}
          onReject={rejectQuote}
          errorMessage={errorMessage}
        />

        <RFQStatusPanel
          state={state}
          quote={quote}
          quoteSecondsRemaining={quoteSecondsRemaining}
          requestingElapsedSeconds={requestingElapsedSeconds}
          side={side}
        />
      </div>
    </div>
  );
}
