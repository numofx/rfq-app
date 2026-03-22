"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Calendar } from "lucide-react";
import { createPublicClient, http } from "viem";
import { base, celo } from "viem/chains";
import { RFQSidePanel } from "@/components/forms/rfq-side-panel";
import { Panel } from "@/components/ui/panel";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  DropdownSelect,
  FieldLabel,
  HelperText,
} from "@/components/ui/rfq-primitives";
import { TextField } from "@/components/ui/text-field";

type RFQState =
  | "IDLE"
  | "REQUESTING"
  | "QUOTES_LIVE"
  | "QUOTE_SELECTED"
  | "SIGNING"
  | "PENDING"
  | "DONE"
  | "ERROR";

type Pair = "USD/NGN" | "USD/KES";
type ProductMode = "futures" | "options";
type SpotHistoryPoint = { t: number; spot: number };

interface Quote {
  id: string;
  maker: string;
  premium: number;
  fees: number;
  spreadBps: number;
}

const QUOTE_WINDOW_SECONDS = 30;
const REQUEST_DELAY_MS = 1400;
const MAX_SPOT_HISTORY_POINTS = 240;
const MIN_DUPLICATE_SAMPLE_GAP_MS = 5_000;
const CHAINLINK_NGN_USD_FEED_BASE = "0xdfbb5Cbc88E382de007bfe6CE99C388176ED80aD";
const CHAINLINK_KES_USD_FEED_CELO = "0x0826492a24b1dBd1d8fcB4701b38C557CE685e9D";
const DEFAULT_SPOT_BY_PAIR: Partial<Record<Pair, number>> = {
  "USD/KES": 130,
};
const chainlinkAggregatorV3Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;
const basePublicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});
const celoPublicClient = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
});

const pairs = [
  { id: "usd-ngn", label: "USD/NGN" },
  { id: "usd-kes", label: "USD/KES" },
] as const;

const forwardPointsByTenor: Record<"7D" | "30D" | "90D" | "180D" | "365D", number> = {
  "7D": 3.82,
  "30D": 16.14,
  "90D": 44.62,
  "180D": 89.25,
  "365D": 177.43,
};
const makers = ["Maker A", "Maker B", "Maker C", "Maker D"] as const;

function PairFlag({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 rounded-full object-cover"
    />
  );
}

function PairFlags({ flags }: { flags: Array<{ src: string; alt: string }> }) {
  return (
    <span className="flex items-center -space-x-1">
      {flags.map((flag) => (
        <PairFlag key={flag.src} src={flag.src} alt={flag.alt} />
      ))}
    </span>
  );
}

function toMoney(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateInput(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function bestPriceFirst(quotes: Quote[]) {
  return quotes.slice().sort((a, b) => a.premium - b.premium);
}

function makeMockQuotes(notional: number): Quote[] {
  void notional;
  return [];
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted/70 border-t-transparent" />;
}

function StatusRail({ state }: { state: RFQState }) {
  const activeIndex = state === "SIGNING" ? 0 : state === "PENDING" ? 1 : state === "DONE" ? 2 : -1;
  const items = ["SIGN", "PENDING", "DONE"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item, index) => {
        const isActive = index <= activeIndex;
        return (
          <div
            key={item}
            className={`rounded-[12px] border px-3 py-2 text-center text-[12px] font-semibold ${
              isActive
                ? "border-border bg-panel-2/60 text-text"
                : "border-border/70 bg-panel-2/40 text-muted"
            }`}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}

interface RFQInterfaceProps {
  mode: ProductMode;
}

export function RFQInterface({ mode }: RFQInterfaceProps) {
  const [state, setState] = useState<RFQState>("IDLE");
  const [pair, setPair] = useState<Pair>("USD/NGN");
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [notional, setNotional] = useState("10000");
  const [strike, setStrike] = useState("2200.00");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [isQuotePopupOpen, setIsQuotePopupOpen] = useState(false);
  const [windowRemaining, setWindowRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseIsoDate(expiryDate));
  const [usdcCngnSpot, setUsdcCngnSpot] = useState<number | null>(null);
  const [usdtKesmSpot, setUsdtKesmSpot] = useState<number | null>(null);
  const [spotHistory, setSpotHistory] = useState<SpotHistoryPoint[]>([]);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const pairOptions = useMemo(
    () =>
      pairs.map((nextPair) => {
        if (nextPair.label === "USD/NGN") {
          return {
            value: nextPair.label as Pair,
            label: nextPair.label,
            trailing: (
              <PairFlags
                flags={[
                  { src: "/tokens/us.svg", alt: "United States flag" },
                  { src: "/tokens/ng.svg", alt: "Nigeria flag" },
                ]}
              />
            ),
          };
        }
        return {
          value: nextPair.label as Pair,
          label: nextPair.label,
          trailing: (
            <PairFlags
              flags={[
                { src: "/tokens/us.svg", alt: "United States flag" },
                { src: "/tokens/ke.svg", alt: "Kenya flag" },
              ]}
            />
          ),
        };
      }),
    []
  );

  const parsedNotional = Number(notional.replace(/,/g, "")) || 0;
  const parsedStrike = Number(strike.replace(/,/g, "")) || 0;
  const [baseCurrency, quoteCurrency] = pair.split("/") as [string, string];
  const spot =
    pair === "USD/NGN"
      ? usdcCngnSpot
      : pair === "USD/KES"
        ? usdtKesmSpot ?? DEFAULT_SPOT_BY_PAIR[pair]
        : DEFAULT_SPOT_BY_PAIR[pair];
  const hasValidSpot = typeof spot === "number" && Number.isFinite(spot) && spot > 0;
  const displayExpiry = parseIsoDate(expiryDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const minDateIso = toIsoDate(new Date());
  const expiryCountdownDays = useMemo(() => {
    if (!expiryDate) return null;
    const diffMs = parseIsoDate(expiryDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [expiryDate]);
  const forwardSpot = 1386.04;
  const forwardTenorBucket = useMemo(() => {
    const days = typeof expiryCountdownDays === "number" ? expiryCountdownDays : 30;
    const buckets = [7, 30, 90, 180, 365] as const;
    const nearest = buckets.reduce((best, current) =>
      Math.abs(current - days) < Math.abs(best - days) ? current : best
    );
    return `${nearest}D` as "7D" | "30D" | "90D" | "180D" | "365D";
  }, [expiryCountdownDays]);
  const forwardPoints = forwardPointsByTenor[forwardTenorBucket];
  const forwardRate = forwardSpot + forwardPoints;
  const displaySpot = mode === "futures" ? forwardSpot : hasValidSpot ? spot : null;
  useEffect(() => {
    setSpotHistory([]);
  }, [pair]);

  useEffect(() => {
    if (!hasValidSpot || typeof spot !== "number") return;

    const nextPoint: SpotHistoryPoint = { t: Date.now(), spot };
    setSpotHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.spot === nextPoint.spot &&
        nextPoint.t - last.t < MIN_DUPLICATE_SAMPLE_GAP_MS
      ) {
        return prev;
      }

      const next = [...prev, nextPoint];
      if (next.length > MAX_SPOT_HISTORY_POINTS) {
        return next.slice(-MAX_SPOT_HISTORY_POINTS);
      }
      return next;
    });
  }, [hasValidSpot, pair, spot]);

  const sortedQuotes = useMemo(() => bestPriceFirst(quotes), [quotes]);
  const selectedQuote = useMemo(
    () => sortedQuotes.find((quote) => quote.id === selectedQuoteId) ?? null,
    [selectedQuoteId, sortedQuotes]
  );

  const expired = (state === "QUOTES_LIVE" || state === "QUOTE_SELECTED") && windowRemaining <= 0;

  const indicativePremium = useMemo(() => {
    if (!parsedNotional || !parsedStrike) return 0;
    const contracts = parsedNotional / parsedStrike;
    return Number((contracts * 1.82).toFixed(2));
  }, [parsedNotional, parsedStrike]);
  const showIndicativePremium = parsedNotional > 0 && parsedStrike > 0;
  const panelPremium = showIndicativePremium ? indicativePremium : undefined;

  useEffect(() => {
    let cancelled = false;

    const fetchUsdcCngnSpot = async () => {
      try {
        const [decimals, latestRoundData] = await Promise.all([
          basePublicClient.readContract({
            address: CHAINLINK_NGN_USD_FEED_BASE,
            abi: chainlinkAggregatorV3Abi,
            functionName: "decimals",
          }),
          basePublicClient.readContract({
            address: CHAINLINK_NGN_USD_FEED_BASE,
            abi: chainlinkAggregatorV3Abi,
            functionName: "latestRoundData",
          }),
        ]);

        const answer = latestRoundData[1];
        if (answer <= 0n) {
          if (!cancelled) setUsdcCngnSpot(null);
          return;
        }

        const ngnPerUsd = 1 / (Number(answer) / 10 ** Number(decimals));
        if (!Number.isFinite(ngnPerUsd) || ngnPerUsd <= 0) {
          if (!cancelled) setUsdcCngnSpot(null);
          return;
        }

        if (!cancelled) setUsdcCngnSpot(ngnPerUsd);
      } catch {
        if (!cancelled) setUsdcCngnSpot(null);
      }
    };

    void fetchUsdcCngnSpot();
    const intervalId = window.setInterval(fetchUsdcCngnSpot, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchUsdtKesmSpot = async () => {
      try {
        const [decimals, latestRoundData] = await Promise.all([
          celoPublicClient.readContract({
            address: CHAINLINK_KES_USD_FEED_CELO,
            abi: chainlinkAggregatorV3Abi,
            functionName: "decimals",
          }),
          celoPublicClient.readContract({
            address: CHAINLINK_KES_USD_FEED_CELO,
            abi: chainlinkAggregatorV3Abi,
            functionName: "latestRoundData",
          }),
        ]);

        const answer = latestRoundData[1];
        if (answer <= 0n) {
          if (!cancelled) setUsdtKesmSpot(null);
          return;
        }

        const usdPerKes = Number(answer) / 10 ** Number(decimals);
        const kesPerUsd = usdPerKes > 0 ? 1 / usdPerKes : 0;
        if (!Number.isFinite(kesPerUsd) || kesPerUsd <= 0) {
          if (!cancelled) setUsdtKesmSpot(null);
          return;
        }

        if (!cancelled) setUsdtKesmSpot(kesPerUsd);
      } catch {
        if (!cancelled) setUsdtKesmSpot(null);
      }
    };

    void fetchUsdtKesmSpot();
    const intervalId = window.setInterval(fetchUsdtKesmSpot, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (state !== "REQUESTING" && state !== "QUOTES_LIVE" && state !== "QUOTE_SELECTED") {
      return;
    }

    if (windowRemaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setWindowRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state, windowRemaining]);

  useEffect(() => {
    if (state !== "REQUESTING") {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextQuotes = makeMockQuotes(parsedNotional);
      setQuotes(nextQuotes);
      setState("QUOTES_LIVE");
    }, REQUEST_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [state, parsedNotional]);

  useEffect(() => {
    if (!expired) {
      return;
    }

    if (state === "QUOTE_SELECTED") {
      setErrorMessage("Selected quote has expired. Request quotes again.");
    }
  }, [expired, state]);

  useEffect(() => {
    if (!isCalendarOpen) {
      return;
    }

    const onOutsideClick = (event: MouseEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [isCalendarOpen]);

  const requestQuotes = () => {
    setErrorMessage(null);
    setSelectedQuoteId(null);
    setQuotes([]);
    setWindowRemaining(QUOTE_WINDOW_SECONDS);
    setIsQuotePopupOpen(true);
    setState("REQUESTING");
  };

  const clearForm = () => {
    setState("IDLE");
    setPair("USD/NGN");
    const resetExpiry = toIsoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    setExpiryDate(resetExpiry);
    setCalendarMonth(parseIsoDate(resetExpiry));
    setIsCalendarOpen(false);
    setNotional("");
    setStrike("");
    setQuotes([]);
    setSelectedQuoteId(null);
    setWindowRemaining(0);
    setErrorMessage(null);
  };

  const selectQuote = (quoteId: string) => {
    if (expired) {
      return;
    }

    setSelectedQuoteId(quoteId);
    setState("QUOTE_SELECTED");
    setIsQuotePopupOpen(false);
    setErrorMessage(null);
  };

  const executeTrade = () => {
    if (!selectedQuote) {
      setState("ERROR");
      setErrorMessage("No quote selected.");
      return;
    }

    if (expired) {
      setState("ERROR");
      setErrorMessage("Quote expired before execution. Request a fresh quote.");
      return;
    }

    setErrorMessage(null);
    setState("SIGNING");

    window.setTimeout(() => {
      setState("PENDING");
    }, 1200);

    window.setTimeout(() => {
      setState("DONE");
    }, 2800);
  };

  return (
    <>
      <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Panel className="space-y-3 p-6">
        <section className="space-y-1">
          {mode === "futures" ? (
            <>
              <div className="space-y-1 pb-2">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Protect against Devaluation</h2>
                <p className="text-[12px] text-muted">Set worst case FX rate</p>
              </div>

              <div>
                <FieldLabel htmlFor="pair">Pair</FieldLabel>
                <DropdownSelect
                  value={pair}
                  options={pairOptions}
                  onChange={setPair}
                />
                <HelperText className="mt-1 text-[11px]">
                  Spot:{" "}
                  <span className="text-text">{forwardSpot.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>{" "}
                  NGN per USD
                </HelperText>
              </div>

              <div>
                <FieldLabel htmlFor="notional">Exposure</FieldLabel>
                <div className="relative">
                  <TextField
                    id="notional"
                    value={notional}
                    onChange={(event) => setNotional(event.target.value)}
                    placeholder="10,000"
                    className="px-8 pr-14"
                  />
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted">
                    USD
                  </span>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="strike">Protection rate</FieldLabel>
                <div className="relative">
                  <TextField
                    id="strike"
                    value={strike}
                    onChange={(event) => setStrike(event.target.value)}
                    placeholder="1,402.00"
                    className="pr-28"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none font-semibold text-muted">
                    NGN per USD
                  </span>
                </div>
                <HelperText className="mt-1 text-[11px]">Choose the rate where protection begins</HelperText>
              </div>

              <div>
                <FieldLabel htmlFor="expiry">Expiry</FieldLabel>
                <div ref={calendarRef} className="relative">
                  <button
                    id="expiry"
                    type="button"
                    onClick={() => {
                      setCalendarMonth(parseIsoDate(expiryDate));
                      setIsCalendarOpen((prev) => !prev);
                    }}
                    className="flex h-11 w-full items-center justify-between rounded-xl border border-border/70 bg-panel-2/50 px-4 text-sm text-text"
                  >
                    <span>{formatDateInput(expiryDate)}</span>
                    <Calendar className="h-4 w-4 text-muted" />
                  </button>

                  {isCalendarOpen ? (
                    <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-2xl border border-border/70 bg-panel p-4 shadow-panel backdrop-blur-panel">
                      <div className="mb-3 flex items-center justify-between px-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth(
                              new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                            )
                          }
                          className="h-8 w-8 rounded-full text-[24px] leading-none text-text"
                          aria-label="Previous month"
                        >
                          ‹
                        </button>
                        <div className="text-[16px] font-semibold text-text">
                          {calendarMonth.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCalendarMonth(
                              new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                            )
                          }
                          className="h-8 w-8 rounded-full text-[24px] leading-none text-text"
                          aria-label="Next month"
                        >
                          ›
                        </button>
                      </div>

                      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted">
                        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                          <div key={day} className="py-1">
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
                        {Array.from({ length: 42 }, (_, idx) => {
                          const year = calendarMonth.getFullYear();
                          const month = calendarMonth.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          const dayNumber = idx - firstDay + 1;
                          const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                          const date = new Date(year, month, dayNumber);
                          const iso = toIsoDate(date);
                          const isDisabled = !inMonth || iso < minDateIso;
                          const isSelected = inMonth && iso === expiryDate;

                          return (
                            <button
                              key={`${year}-${month}-${idx}`}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                setExpiryDate(iso);
                                setIsCalendarOpen(false);
                              }}
                              className={`mx-auto h-8 w-8 rounded-[9px] text-[14px] ${
                                isSelected
                                  ? "bg-white font-semibold text-black"
                                  : isDisabled
                                    ? "text-muted/50"
                                    : "text-text"
                              }`}
                            >
                              {inMonth ? dayNumber : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                <HelperText className="mt-1 text-[11px]">
                  {typeof expiryCountdownDays === "number" ? `${expiryCountdownDays} days` : "—"}
                </HelperText>
              </div>

              <PrimaryButton type="button" onClick={requestQuotes}>
                {`Protect above ${
                  parsedStrike > 0 ? Math.round(parsedStrike).toLocaleString("en-US") : "XXXX"
                }`}
              </PrimaryButton>
              <HelperText className="text-[11px]">Quotes valid for 30s after response.</HelperText>

              <button
                type="button"
                onClick={clearForm}
                className="text-left text-[12px] font-semibold text-muted"
              >
                Clear
              </button>
            </>
          ) : (
            <>
              <div>
                <FieldLabel htmlFor="pair">Pair</FieldLabel>
                <DropdownSelect
                  value={pair}
                  options={pairOptions}
                  onChange={setPair}
                />
                <HelperText className="mt-1 text-[11px]">
                  Spot:{" "}
                  <span className="text-text">
                    {hasValidSpot ? spot.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
                  </span>{" "}
                  {quoteCurrency} per {baseCurrency}
                </HelperText>
              </div>

              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="expiry">Expiry</FieldLabel>
                  <div ref={calendarRef} className="relative">
                    <button
                      id="expiry"
                      type="button"
                      onClick={() => {
                        setCalendarMonth(parseIsoDate(expiryDate));
                        setIsCalendarOpen((prev) => !prev);
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-xl border border-border/70 bg-panel-2/50 px-4 text-sm text-text"
                    >
                      <span>{formatDateInput(expiryDate)}</span>
                      <Calendar className="h-4 w-4 text-muted" />
                    </button>

                    {isCalendarOpen ? (
                      <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-2xl border border-border/70 bg-panel p-4 shadow-panel backdrop-blur-panel">
                        <div className="mb-3 flex items-center justify-between px-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCalendarMonth(
                                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                              )
                            }
                            className="h-8 w-8 rounded-full text-[24px] leading-none text-text"
                            aria-label="Previous month"
                          >
                            ‹
                          </button>
                          <div className="text-[16px] font-semibold text-text">
                            {calendarMonth.toLocaleDateString("en-US", {
                              month: "long",
                              year: "numeric",
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCalendarMonth(
                                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                              )
                            }
                            className="h-8 w-8 rounded-full text-[24px] leading-none text-text"
                            aria-label="Next month"
                          >
                            ›
                          </button>
                        </div>

                        <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted">
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                            <div key={day} className="py-1">
                              {day}
                            </div>
                          ))}
                        </div>

                        <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
                          {Array.from({ length: 42 }, (_, idx) => {
                            const year = calendarMonth.getFullYear();
                            const month = calendarMonth.getMonth();
                            const firstDay = new Date(year, month, 1).getDay();
                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                            const dayNumber = idx - firstDay + 1;
                            const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                            const date = new Date(year, month, dayNumber);
                            const iso = toIsoDate(date);
                            const isDisabled = !inMonth || iso < minDateIso;
                            const isSelected = inMonth && iso === expiryDate;

                            return (
                              <button
                                key={`${year}-${month}-${idx}`}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                  setExpiryDate(iso);
                                  setIsCalendarOpen(false);
                                }}
                                className={`mx-auto h-8 w-8 rounded-[9px] text-[14px] ${
                                  isSelected
                                    ? "bg-white font-semibold text-black"
                                    : isDisabled
                                      ? "text-muted/50"
                                      : "text-text"
                                }`}
                              >
                                {inMonth ? dayNumber : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <HelperText className="mt-1 text-[11px]">
                    {typeof expiryCountdownDays === "number" ? `${expiryCountdownDays} days` : "—"}
                  </HelperText>
                </div>

                <div>
                  <FieldLabel htmlFor="strike">Protection rate</FieldLabel>
                  <div className="relative">
                    <TextField
                      id="strike"
                      value={strike}
                      onChange={(event) => setStrike(event.target.value)}
                      placeholder="2,200.00"
                      className="pr-28"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none font-semibold text-muted">
                      {quoteCurrency} per {baseCurrency}
                    </span>
                  </div>
                  <HelperText className="mt-1 text-[11px]">Choose the rate where protection begins</HelperText>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="notional">Exposure</FieldLabel>
                <div className="relative">
                  <TextField
                    id="notional"
                    value={notional}
                    onChange={(event) => setNotional(event.target.value)}
                    placeholder="10,000"
                    className="px-8 pr-14"
                  />
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted">
                    {baseCurrency}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-panel-2/50 px-3 py-2 text-[11px] text-muted">
                <div className="flex items-center justify-between">
                  <span>Cost of protection</span>
                  <span>Indicative</span>
                </div>
                <div className="mt-1 text-[16px] font-semibold text-text">
                  {showIndicativePremium ? toMoney(indicativePremium) : "—"}
                </div>
                <div className="mt-1">
                  {state === "REQUESTING"
                    ? "Requesting quotes..."
                    : showIndicativePremium
                      ? `${((indicativePremium / parsedNotional) * 100).toFixed(3)}% of exposure (${baseCurrency})`
                      : "Enter exposure and protection rate"}
                </div>
              </div>

              <PrimaryButton type="button" onClick={requestQuotes}>
                Request protection quote
              </PrimaryButton>
              <HelperText className="text-[11px]">Quotes valid for 30s after response.</HelperText>
            </>
          )}

          {mode === "options" ? (
            <button
              type="button"
              onClick={clearForm}
              className="text-left text-[12px] font-semibold text-muted"
            >
              Clear
            </button>
          ) : null}
        </section>

          {selectedQuote ? (
            <section className="space-y-1 rounded-xl border border-border/70 bg-panel-2/50 p-2">
              <div className="text-[11px] font-semibold tracking-[0.04em] text-muted">CONFIRMATION</div>

              <div className="grid grid-cols-2 gap-y-1 text-[12px]">
                <span className="text-muted">Type</span>
                <span className="text-right text-text">
                  {mode === "options" ? "PROTECTION" : "PROTECTION"}
                </span>
                <span className="text-muted">Pair</span>
                <span className="text-right text-text">{pair}</span>
                <span className="text-muted">Exposure ({baseCurrency})</span>
                <span className="text-right text-text">{toMoney(parsedNotional)}</span>
                <span className="text-muted">Expiry</span>
                <span className="text-right text-text">{displayExpiry}</span>
                <span className="text-muted">Protection rate</span>
                <span className="text-right text-text">{strike || "-"}</span>
                {mode === "futures" ? (
                  <>
                    <span className="text-muted">Cost of protection</span>
                    <span className="text-right text-text">
                      {selectedQuote ? toMoney(selectedQuote.premium) : "—"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-muted">Cost of protection</span>
                    <span className="text-right text-text">{toMoney(selectedQuote.premium)}</span>
                    <span className="text-muted">Fees</span>
                    <span className="text-right text-text">{toMoney(selectedQuote.fees)}</span>
                    <span className="font-semibold text-text">Total cost</span>
                    <span className="text-right font-semibold text-text">
                      {toMoney(selectedQuote.premium + selectedQuote.fees)}
                    </span>
                  </>
                )}
              </div>

              {(state === "QUOTE_SELECTED" || state === "SIGNING" || state === "PENDING" || state === "DONE") && (
                <div className="space-y-3">
                  <PrimaryButton
                    type="button"
                    onClick={executeTrade}
                    disabled={state === "SIGNING" || state === "PENDING" || state === "DONE"}
                  >
                    {state === "SIGNING"
                      ? "Signing..."
                      : state === "PENDING"
                        ? "Pending..."
                        : state === "DONE"
                          ? "Trade executed"
                          : "Execute trade"}
                  </PrimaryButton>
                  <StatusRail state={state} />
                </div>
              )}
            </section>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-border/70 bg-panel-2/50 px-3 py-2 text-[11px] text-text">
              {errorMessage}
            </div>
          ) : null}
      </Panel>
      <RFQSidePanel
        mode={mode}
        pair={pair}
        optionType="call"
        spot={displaySpot}
        strike={parsedStrike}
        daysToExpiry={expiryCountdownDays}
        premiumUSDC={panelPremium}
        spotHistory={spotHistory}
        forwardRate={forwardRate}
        notional={parsedNotional}
      />
      </div>

      {isQuotePopupOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-[360px] rounded-2xl border border-border/70 bg-panel p-4 shadow-panel backdrop-blur-panel">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-muted">
                {mode === "futures" ? "Protection Quotes" : "Quotes"}
              </div>
              <button
                type="button"
                onClick={() => setIsQuotePopupOpen(false)}
                className="text-[12px] font-semibold text-muted"
              >
                Close
              </button>
            </div>

            <div className="mt-2 text-[11px] text-muted">
              {windowRemaining > 0 ? `Expires in ${windowRemaining}s` : "Quotes expired"}
            </div>

            {sortedQuotes.length === 0 ? (
              <div className="mt-3 rounded-xl border border-border/70 bg-panel-2/50 px-3 py-2.5 text-[12px] text-muted">
                No quotes yet.
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {sortedQuotes.map((quote) => (
                <div
                  key={quote.id}
                  className="rounded-xl border border-border/70 bg-panel-2/50 px-3 py-2.5 text-center"
                >
                  <div className="text-[13px] font-semibold text-text">{quote.maker}</div>
                  <div className="mt-0.5 text-[11px] text-muted">Spread {quote.spreadBps} bps</div>
                  <div className="mt-1 text-[18px] font-semibold text-text">
                    {toMoney(quote.premium)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">Fees {toMoney(quote.fees)}</div>
                  <div className="mt-1 text-[11px] text-muted">TTL: {windowRemaining}s</div>
                  <button
                    type="button"
                    onClick={() => selectQuote(quote.id)}
                    disabled={expired || state === "SIGNING" || state === "PENDING" || state === "DONE"}
                    className="mt-2 h-8 w-full rounded-lg border border-border/70 px-3 text-[12px] font-semibold text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mode === "futures" ? "Select Protection" : "Accept"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
