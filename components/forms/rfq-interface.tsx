"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { PrimaryButton } from "@/components/ui/primary-button";
import { FieldLabel } from "@/components/ui/rfq-primitives";
import { TextField } from "@/components/ui/text-field";

type Pair = "USDC/cNGN";
type Settlement = "cNGN";
type SideMode = "BUY_CNGN" | "SELL_CNGN";
type ApiSide = "BUY" | "SELL";

type QuoteLifecycleState =
  | "IDLE"
  | "REQUESTING"
  | "QUOTE_ACTIVE"
  | "QUOTE_EXPIRED"
  | "ACCEPTING"
  | "ACCEPTED"
  | "REJECTED"
  | "ERROR";

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

interface RfqDirectionToggleProps {
  value: SideMode;
  onChange: (next: SideMode) => void;
  disabled: boolean;
  marketKind: "Spot" | "Future";
}

interface NotionalPresetChipsProps {
  disabled: boolean;
  onSelect: (value: number) => void;
}

interface FirmQuoteSummaryProps {
  state: QuoteLifecycleState;
  side: SideMode;
  quote: SpotQuote | null;
  inputNotional: number;
  quoteSecondsRemaining: number;
  deltaPct: number | null;
  errorMessage: string | null;
}

interface QuoteExpiryBarProps {
  secondsRemaining: number;
  totalSeconds: number;
}

interface QuoteDeltaBadgeProps {
  deltaPct: number | null;
}

interface QuoteTrustRowProps {
  secondsRemaining: number;
}

interface RfqActionBarProps {
  state: QuoteLifecycleState;
  quoteSecondsRemaining: number;
  onRequest: () => void;
  onAccept: () => void;
  onReject: () => void;
  hasActiveQuote: boolean;
  errorMessage: string | null;
}

interface MarketPresentation {
  marketLabel: string;
  marketKind: "Spot" | "Future";
}

const DEFAULT_PAIR: Pair = "USDC/cNGN";
const DEFAULT_SETTLEMENT: Settlement = "cNGN";
const MIN_SIZE_USD = 10_000;
const INDICATIVE_RATE = 1385;
const INDICATIVE_SIZE_BAND = "$10k - $1M+";
const INDICATIVE_RESPONSE = "2-10s";
const MOCK_DELAY_MS = 1400;
const ACCEPTING_DELAY_MS = 850;
const REQUESTING_SKELETON_ROWS = [1, 2, 3];
const NOTIONAL_PRESETS = [10_000, 50_000, 100_000, 250_000, 1_000_000];

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

function formatCompactUsd(value: number) {
  if (value >= 1_000_000) return "$1M";
  return `$${Math.round(value / 1000)}k`;
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

function getQuoteFlow(side: SideMode, price: number, sizeUsd: number) {
  if (side === "BUY_CNGN") {
    return {
      payAmount: sizeUsd,
      payAsset: "USDC",
      receiveAmount: sizeUsd * price,
      receiveAsset: "cNGN",
    };
  }

  return {
    payAmount: sizeUsd * price,
    payAsset: "cNGN",
    receiveAmount: sizeUsd,
    receiveAsset: "USDC",
  };
}

function RfqDirectionToggle({ value, onChange, disabled, marketKind }: RfqDirectionToggleProps) {
  if (marketKind === "Future") {
    return (
      <div className="grid grid-cols-1 gap-1 rounded-lg border border-border/70 bg-panel-2/60 p-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("BUY_CNGN")}
          disabled={disabled}
          className={`rounded-md border px-3 py-2 text-left transition-colors ${
            value === "BUY_CNGN"
              ? "border-white bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <div className="text-[12px] font-semibold">Long USD</div>
          <div className={`mt-0.5 text-[11px] ${value === "BUY_CNGN" ? "text-black/70" : "text-muted"}`}>
            Buy USD / sell NGN
          </div>
          <div className={`mt-1 text-[10px] ${value === "BUY_CNGN" ? "text-black/70" : "text-muted"}`}>
            Lock USD at this rate
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange("SELL_CNGN")}
          disabled={disabled}
          className={`rounded-md border px-3 py-2 text-left transition-colors ${
            value === "SELL_CNGN"
              ? "border-white bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          <div className="text-[12px] font-semibold">Short USD</div>
          <div className={`mt-0.5 text-[11px] ${value === "SELL_CNGN" ? "text-black/70" : "text-muted"}`}>
            Sell USD / buy NGN
          </div>
          <div className={`mt-1 text-[10px] ${value === "SELL_CNGN" ? "text-black/70" : "text-muted"}`}>
            Earn carry / provide liquidity
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-panel-2/60 p-1">
      <button
        type="button"
        onClick={() => onChange("BUY_CNGN")}
        disabled={disabled}
        className={`h-9 rounded-md border text-[12px] font-semibold transition-colors ${
          value === "BUY_CNGN"
            ? "border-white bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
            : "border-transparent text-muted hover:text-text"
        }`}
      >
        I want cNGN
      </button>
      <button
        type="button"
        onClick={() => onChange("SELL_CNGN")}
        disabled={disabled}
        className={`h-9 rounded-md border text-[12px] font-semibold transition-colors ${
          value === "SELL_CNGN"
            ? "border-white bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
            : "border-transparent text-muted hover:text-text"
        }`}
      >
        I want USDC
      </button>
    </div>
  );
}

function NotionalPresetChips({ disabled, onSelect }: NotionalPresetChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {NOTIONAL_PRESETS.map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(value)}
          className="rounded-md border border-border/70 bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          {formatCompactUsd(value)}
        </button>
      ))}
    </div>
  );
}

function NotionalInput({
  value,
  onChange,
  label,
  disabled,
  onPreset,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  disabled: boolean;
  onPreset: (next: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="rfq-notional">{label}</FieldLabel>
        <span className="text-[10px] text-muted">Min size: $10,000 equivalent</span>
      </div>
      <div className="relative">
        <TextField
          id="rfq-notional"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="100000"
          disabled={disabled}
          className="h-10 px-7 text-[13px] tabular-nums disabled:opacity-80"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">$</span>
      </div>
      <NotionalPresetChips disabled={disabled} onSelect={onPreset} />
    </div>
  );
}

function QuoteExpiryBar({ secondsRemaining, totalSeconds }: QuoteExpiryBarProps) {
  const safeTotal = Math.max(1, totalSeconds);
  const progress = Math.max(0, Math.min(100, (secondsRemaining / safeTotal) * 100));
  const lowTime = secondsRemaining > 0 && secondsRemaining < 5;

  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-panel/80">
        <div
          className={`h-full transition-[width] duration-500 ${lowTime ? "bg-amber-300" : "bg-white/85"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted">Firm quote validity</span>
        <span className={`font-semibold tabular-nums ${lowTime ? "text-amber-200" : "text-text"}`}>{secondsRemaining}s</span>
      </div>
    </div>
  );
}

function QuoteDeltaBadge({ deltaPct }: QuoteDeltaBadgeProps) {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return null;

  const absDelta = Math.abs(deltaPct);
  if (absDelta < 0.005) {
    return (
      <span className="rounded-md border border-border/70 bg-panel px-2 py-1 text-[11px] font-semibold text-muted">
        In line with indicative
      </span>
    );
  }

  if (deltaPct < 0) {
    return (
      <span className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 tabular-nums">
        {absDelta.toFixed(2)}% better than indicative
      </span>
    );
  }

  return (
    <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[11px] font-semibold text-amber-100 tabular-nums">
      {absDelta.toFixed(2)}% below indicative
    </span>
  );
}

function QuoteTrustRow({ secondsRemaining }: QuoteTrustRowProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="rounded-md border border-border/70 bg-panel px-2 py-1 text-[11px] font-semibold text-text">Guaranteed fill</span>
      <span className="rounded-md border border-border/70 bg-panel px-2 py-1 text-[11px] font-semibold text-text tabular-nums">
        Valid for {secondsRemaining}s
      </span>
      <span className="rounded-md border border-border/70 bg-panel px-2 py-1 text-[11px] font-semibold text-text">
        Settlement via cNGN / NGN rails
      </span>
    </div>
  );
}

function FirmQuoteSummary({
  state,
  side,
  quote,
  inputNotional,
  quoteSecondsRemaining,
  deltaPct,
  errorMessage,
}: FirmQuoteSummaryProps) {
  const lowTime = quoteSecondsRemaining > 0 && quoteSecondsRemaining < 5;

  const previewFlow = getQuoteFlow(side, INDICATIVE_RATE, side === "BUY_CNGN" ? inputNotional : inputNotional / INDICATIVE_RATE || 0);
  const activeFlow = quote ? getQuoteFlow(side, quote.price, quote.sizeUsd) : null;

  if (state === "REQUESTING") {
    return (
      <div className="rounded-lg border border-border/70 bg-panel-2/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-text">Requesting firm quote</p>
          <span className="text-[11px] text-muted">Contacting liquidity providers</span>
        </div>
        <div className="space-y-2">
          {REQUESTING_SKELETON_ROWS.map((row) => (
            <div key={row} className="h-5 animate-pulse rounded bg-panel/80" />
          ))}
        </div>
      </div>
    );
  }

  if (state === "QUOTE_ACTIVE" && quote && activeFlow) {
    return (
      <div className="space-y-3 rounded-lg border border-white/20 bg-gradient-to-b from-white/10 via-panel-2/80 to-panel/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white/90">Firm Quote</p>
          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums ${lowTime ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-border/70 bg-panel text-text"}`}>
            {quoteSecondsRemaining}s remaining
          </span>
        </div>

        <div className="space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">You pay</span>
            <span className="font-semibold text-text tabular-nums">
              {formatAmount(activeFlow.payAmount)} {activeFlow.payAsset}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">You receive</span>
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-white tabular-nums">
              {formatAmount(activeFlow.receiveAmount)} {activeFlow.receiveAsset}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Firm rate</span>
            <span className="font-semibold text-text tabular-nums">{formatRate(quote.price)} cNGN / USDC</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <QuoteDeltaBadge deltaPct={deltaPct} />
          <span className="text-[11px] text-muted">Quote ID {quote.quoteId}</span>
        </div>

        <QuoteExpiryBar secondsRemaining={quoteSecondsRemaining} totalSeconds={quote.ttlSeconds} />
        <QuoteTrustRow secondsRemaining={quoteSecondsRemaining} />
      </div>
    );
  }

  if (state === "QUOTE_EXPIRED") {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
        <p className="text-[13px] font-semibold text-amber-100">Firm quote expired</p>
        <p className="text-[12px] text-amber-100/90">Request a new quote to continue at a guaranteed rate.</p>
      </div>
    );
  }

  if (state === "ACCEPTED" && quote && activeFlow) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-300/35 bg-emerald-300/10 p-4">
        <p className="text-[13px] font-semibold text-emerald-100">Quote accepted</p>
        <p className="text-[12px] text-emerald-100/90">Execution confirmed at {formatRate(quote.price)} cNGN / USDC.</p>
        <p className="text-[12px] text-emerald-100/90 tabular-nums">
          {formatAmount(activeFlow.payAmount)} {activeFlow.payAsset} → {formatAmount(activeFlow.receiveAmount)} {activeFlow.receiveAsset}
        </p>
      </div>
    );
  }

  if (state === "REJECTED") {
    return (
      <div className="space-y-2 rounded-lg border border-border/70 bg-panel-2/60 p-4">
        <p className="text-[13px] font-semibold text-text">Quote rejected</p>
        <p className="text-[12px] text-muted">You can request a fresh firm quote at any time.</p>
      </div>
    );
  }

  if (state === "ERROR") {
    return (
      <div className="space-y-2 rounded-lg border border-red-300/30 bg-red-300/10 p-4">
        <p className="text-[13px] font-semibold text-red-100">Unable to continue</p>
        <p className="text-[12px] text-red-100/90">{errorMessage || "Please adjust size and request a new quote."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-panel-2/55 p-4">
      <p className="text-[13px] font-semibold text-text">Indicative snapshot</p>
      <div className="space-y-1 text-[12px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">You pay</span>
          <span className="font-semibold text-text tabular-nums">
            {formatAmount(previewFlow.payAmount)} {previewFlow.payAsset}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">You receive</span>
          <span className="font-semibold text-text tabular-nums">
            {formatAmount(previewFlow.receiveAmount)} {previewFlow.receiveAsset}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Indicative rate</span>
          <span className="font-semibold text-text tabular-nums">{formatRate(INDICATIVE_RATE)} cNGN / USDC</span>
        </div>
      </div>
    </div>
  );
}

function RfqActionBar({
  state,
  quoteSecondsRemaining,
  onRequest,
  onAccept,
  onReject,
  hasActiveQuote,
  errorMessage,
}: RfqActionBarProps) {
  const lowTime = quoteSecondsRemaining > 0 && quoteSecondsRemaining < 5;

  if (state === "QUOTE_ACTIVE") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="h-10 rounded-lg bg-white text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
          >
            Accept Quote {quoteSecondsRemaining > 0 ? `(${quoteSecondsRemaining}s)` : ""}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="h-10 rounded-lg border border-border/70 bg-transparent text-[13px] font-semibold text-text transition-colors hover:bg-panel"
          >
            Reject
          </button>
        </div>
        <p className={`text-[11px] ${lowTime ? "text-amber-200" : "text-muted"}`}>Guaranteed at this rate until expiry</p>
      </div>
    );
  }

  if (state === "QUOTE_EXPIRED") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            className="h-10 rounded-lg bg-white/60 text-[13px] font-semibold text-black/70"
          >
            Accept Quote
          </button>
          <button
            type="button"
            onClick={onRequest}
            className="h-10 rounded-lg bg-white text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
          >
            Request New Quote
          </button>
        </div>
        <p className="text-[11px] text-muted">Previous quote is no longer executable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <PrimaryButton
        type="button"
        onClick={onRequest}
        disabled={state === "REQUESTING" || state === "ACCEPTING" || state === "ACCEPTED" || hasActiveQuote}
        className="h-10 w-full text-[14px] font-semibold tracking-[0.01em] disabled:opacity-75"
      >
        {state === "REQUESTING"
          ? "Requesting Firm Quote..."
          : state === "ACCEPTING"
            ? "Accepting Quote..."
            : state === "ACCEPTED"
              ? "Quote Accepted"
              : "Get Quote"}
      </PrimaryButton>
      {errorMessage ? <p className="text-[11px] text-red-200">{errorMessage}</p> : null}
    </div>
  );
}

function RFQTicket({
  marketKind,
  side,
  state,
  notionalInput,
  onSideChange,
  onNotionalChange,
  quote,
  quoteSecondsRemaining,
  deltaPct,
  parsedNotional,
  onPresetNotional,
  onRequest,
  onAccept,
  onReject,
  errorMessage,
}: {
  marketKind: "Spot" | "Future";
  side: SideMode;
  state: QuoteLifecycleState;
  notionalInput: string;
  onSideChange: (next: SideMode) => void;
  onNotionalChange: (next: string) => void;
  quote: SpotQuote | null;
  quoteSecondsRemaining: number;
  deltaPct: number | null;
  parsedNotional: number;
  onPresetNotional: (next: number) => void;
  onRequest: () => void;
  onAccept: () => void;
  onReject: () => void;
  errorMessage: string | null;
}) {
  const directionLocked = state === "REQUESTING" || state === "QUOTE_ACTIVE" || state === "ACCEPTING";
  const sideLabel = marketKind === "Future" ? (side === "BUY_CNGN" ? "Long" : "Short") : side === "BUY_CNGN" ? "Buy" : "Sell";
  const priceValue =
    quote && (state === "QUOTE_ACTIVE" || state === "ACCEPTING" || state === "ACCEPTED") ? quote.price : INDICATIVE_RATE;

  return (
    <Panel className="space-y-4 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-text">Request Firm Quote</h2>
      </div>

      <FirmQuoteSummary
        state={state}
        side={side}
        quote={quote}
        inputNotional={parsedNotional}
        quoteSecondsRemaining={quoteSecondsRemaining}
        deltaPct={deltaPct}
        errorMessage={errorMessage}
      />

      <RfqDirectionToggle value={side} onChange={onSideChange} disabled={directionLocked} marketKind={marketKind} />

      <NotionalInput
        value={notionalInput}
        onChange={onNotionalChange}
        label="Notional"
        disabled={directionLocked}
        onPreset={onPresetNotional}
      />

      <div className="space-y-1">
        <FieldLabel>Position</FieldLabel>
        <div className="space-y-2 rounded-lg border border-border/70 bg-panel/70 p-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">Side</span>
            <span className="font-semibold text-text">{sideLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">Notional</span>
            <span className="font-semibold text-text tabular-nums">${formatAmount(parsedNotional || 0)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted">Price</span>
            <span className="font-semibold text-text tabular-nums">{formatRate(priceValue)} cNGN / USDC</span>
          </div>
        </div>
      </div>

      <RfqActionBar
        state={state}
        quoteSecondsRemaining={quoteSecondsRemaining}
        onRequest={onRequest}
        onAccept={onAccept}
        onReject={onReject}
        hasActiveQuote={state === "QUOTE_ACTIVE"}
        errorMessage={errorMessage}
      />
    </Panel>
  );
}

function RFQStatusPanel({
  marketLabel,
  state,
  quote,
  quoteSecondsRemaining,
  requestingElapsedSeconds,
}: {
  marketLabel: string;
  state: QuoteLifecycleState;
  quote: SpotQuote | null;
  quoteSecondsRemaining: number;
  requestingElapsedSeconds: number;
}) {
  const statusLine = (() => {
    if (state === "REQUESTING") return "Fetching executable firm quote";
    if (state === "QUOTE_ACTIVE") return "Firm quote live";
    if (state === "QUOTE_EXPIRED") return "Firm quote expired";
    if (state === "ACCEPTING") return "Submitting acceptance";
    if (state === "ACCEPTED") return "Execution confirmed";
    if (state === "REJECTED") return "Quote rejected";
    if (state === "ERROR") return "Action required";
    return "Awaiting quote request";
  })();

  return (
    <div className="space-y-3">
      <Panel className="space-y-3 p-4">
        <p className="text-[11px] font-semibold tracking-[0.04em] text-muted">STATUS</p>
        <p className="text-[14px] font-semibold text-text">{statusLine}</p>

        {state === "REQUESTING" ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Elapsed</span>
            <span className="font-semibold text-text tabular-nums">{requestingElapsedSeconds}s</span>
          </div>
        ) : null}

        {quote ? (
          <div className="grid grid-cols-2 gap-y-1 text-[11px]">
            <span className="text-muted">Quote ID</span>
            <span className="text-right text-text">{quote.quoteId}</span>
            <span className="text-muted">Firm rate</span>
            <span className="text-right text-text tabular-nums">{formatRate(quote.price)} cNGN / USDC</span>
            <span className="text-muted">Validity</span>
            <span className="text-right text-text tabular-nums">{quoteSecondsRemaining}s</span>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Enter notional and request quote.</p>
        )}
      </Panel>

      <Panel className="space-y-2 p-4">
        <p className="text-[11px] font-semibold tracking-[0.04em] text-muted">MARKET</p>
        <div className="grid grid-cols-2 gap-y-1 text-[11px]">
          <span className="text-muted">Selected market</span>
          <span className="text-right text-text">{marketLabel}</span>
          <span className="text-muted">Indicative rate</span>
          <span className="text-right text-text tabular-nums">{formatRate(INDICATIVE_RATE)} cNGN / USDC</span>
          <span className="text-muted">Size band</span>
          <span className="text-right text-text">{INDICATIVE_SIZE_BAND}</span>
          <span className="text-muted">Expected response</span>
          <span className="text-right text-text">{INDICATIVE_RESPONSE}</span>
        </div>
      </Panel>
    </div>
  );
}

export function RFQInterface({ marketLabel, marketKind }: MarketPresentation) {
  const [state, setState] = useState<QuoteLifecycleState>("IDLE");
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
  const hasQuote = Boolean(quote);

  const requestSizeUsd = useMemo(() => {
    if (!parsedNotional || parsedNotional <= 0) return 0;
    return side === "BUY_CNGN" ? parsedNotional : parsedNotional / INDICATIVE_RATE;
  }, [parsedNotional, side]);

  const deltaPct = useMemo(() => {
    if (!quote) return null;
    return ((quote.price - INDICATIVE_RATE) / INDICATIVE_RATE) * 100;
  }, [quote]);

  useEffect(() => {
    if (!requesting) return;

    const timer = window.setInterval(() => {
      setRequestingElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [requesting]);

  useEffect(() => {
    if (state !== "QUOTE_ACTIVE" || !quote) return;

    const tick = () => {
      const ms = new Date(quote.expiresAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.ceil(ms / 1000));
      setQuoteSecondsRemaining(seconds);

      if (seconds <= 0) {
        setState("QUOTE_EXPIRED");
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [quote, state]);

  const resetForNewCycle = () => {
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
    resetForNewCycle();
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
      setState("QUOTE_ACTIVE");
    } catch {
      const fallback = createMockQuote(requestSizeUsd);
      await delay(MOCK_DELAY_MS);
      setQuote(fallback);
      setQuoteSecondsRemaining(fallback.ttlSeconds);
      setState("QUOTE_ACTIVE");
    }
  };

  const acceptQuote = useCallback(async () => {
    if (!quote) {
      setState("ERROR");
      setErrorMessage("No active quote to accept.");
      return;
    }

    if (state !== "QUOTE_ACTIVE") return;

    if (quoteSecondsRemaining <= 0 || new Date(quote.expiresAt).getTime() <= Date.now()) {
      setState("QUOTE_EXPIRED");
      return;
    }

    setErrorMessage(null);
    setState("ACCEPTING");
    await delay(ACCEPTING_DELAY_MS);
    setState("ACCEPTED");
  }, [quote, quoteSecondsRemaining, state]);

  useEffect(() => {
    if (state !== "QUOTE_ACTIVE") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      void acceptQuote();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [acceptQuote, state]);

  const rejectQuote = () => {
    setState("REJECTED");
    setErrorMessage(null);
    resetForNewCycle();
  };

  const handleNotionalPreset = (value: number) => {
    setNotionalInput(String(value));
  };

  return (
    <div className="w-full max-w-[1000px] space-y-3">
      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <RFQTicket
          marketKind={marketKind}
          side={side}
          state={state}
          notionalInput={notionalInput}
          onSideChange={setSide}
          onNotionalChange={setNotionalInput}
          quote={quote}
          quoteSecondsRemaining={quoteSecondsRemaining}
          deltaPct={deltaPct}
          parsedNotional={parsedNotional}
          onPresetNotional={handleNotionalPreset}
          onRequest={requestFirmQuote}
          onAccept={acceptQuote}
          onReject={rejectQuote}
          errorMessage={errorMessage}
        />

        <RFQStatusPanel
          marketLabel={marketLabel}
          state={state}
          quote={hasQuote ? quote : null}
          quoteSecondsRemaining={quoteSecondsRemaining}
          requestingElapsedSeconds={requestingElapsedSeconds}
        />
      </div>
    </div>
  );
}
