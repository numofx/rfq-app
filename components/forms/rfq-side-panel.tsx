"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/rfq-primitives";

type ProductMode = "futures" | "options";
type OptionType = "call" | "put";
type ForwardDirection = "buy_usd" | "sell_usd";
type PanelTab = "chart" | "payoff";

interface SpotHistoryPoint {
  t: number;
  spot: number;
}

interface RFQSidePanelProps {
  mode?: ProductMode;
  pair?: string;
  optionType: OptionType;
  spot: number | null;
  strike: number;
  daysToExpiry: number | null;
  premiumUSDC?: number;
  spotHistory?: SpotHistoryPoint[];
  forwardDirection?: ForwardDirection;
  forwardRate?: number;
  notional?: number;
}

function formatWhole(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatTwo(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatExpiry(daysToExpiry: number | null) {
  if (typeof daysToExpiry !== "number" || !Number.isFinite(daysToExpiry)) return "—";
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + daysToExpiry);
  return expiry.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function buildDefaultHistory(spot: number, days = 90): SpotHistoryPoint[] {
  const now = new Date();
  const data: SpotHistoryPoint[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const wave = Math.sin((days - i) / 9) * spot * 0.025;
    const trend = ((days - i) / days - 0.5) * spot * 0.03;
    const point = i === 0 ? spot : Math.max(0, spot + wave + trend);
    data.push({ t: date.getTime(), spot: point });
  }

  return data;
}

function buildOptionPayoff({
  optionType,
  strike,
  premiumUSDC,
  spot,
}: {
  optionType: OptionType;
  strike: number;
  premiumUSDC: number;
  spot: number;
}) {
  const floor = Math.max(1, Math.min(strike, spot) * 0.55);
  const ceil = Math.max(strike, spot) * 1.45;
  const steps = 65;

  return Array.from({ length: steps }, (_, idx) => {
    const price = floor + ((ceil - floor) * idx) / (steps - 1);
    const intrinsic = optionType === "call" ? Math.max(price - strike, 0) : Math.max(strike - price, 0);
    const profit = intrinsic - premiumUSDC;
    return { spot: price, profit };
  });
}

export function RFQSidePanel({
  mode = "options",
  pair = "USD/NGN",
  optionType,
  spot,
  strike,
  daysToExpiry,
  premiumUSDC,
  spotHistory,
  forwardDirection = "buy_usd",
  forwardRate = 1402.18,
  notional = 10_000,
}: RFQSidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("chart");
  const hasSpot = typeof spot === "number" && Number.isFinite(spot) && spot > 0;
  const safeSpot = hasSpot ? (spot as number) : Math.max(strike || 1, 1);

  const isForwardMode = mode === "futures";

  const historyData = useMemo(() => {
    if (spotHistory?.length && spotHistory.length >= 2) return spotHistory;
    return buildDefaultHistory(safeSpot);
  }, [safeSpot, spotHistory]);

  const optionPayoffData = useMemo(
    () =>
      buildOptionPayoff({
        optionType,
        strike: strike > 0 ? strike : safeSpot,
        premiumUSDC: typeof premiumUSDC === "number" ? premiumUSDC : 0,
        spot: safeSpot,
      }),
    [optionType, strike, premiumUSDC, safeSpot]
  );

  const forwardPayoffData = useMemo(() => {
    const protectionRate = strike > 0 ? strike : forwardRate;
    const floor = Math.max(1, protectionRate - 220);
    const ceil = protectionRate + 220;
    const steps = 55;
    const coverageUnits = protectionRate > 0 ? notional / protectionRate : 0;
    return Array.from({ length: steps }, (_, idx) => {
      const spotAtExpiry = floor + ((ceil - floor) * idx) / (steps - 1);
      const payout =
        forwardDirection === "buy_usd"
          ? Math.max(spotAtExpiry - protectionRate, 0) * coverageUnits
          : Math.max(protectionRate - spotAtExpiry, 0) * coverageUnits;
      return { spotAtExpiry, payout };
    });
  }, [forwardDirection, forwardRate, notional, strike]);

  if (isForwardMode) {
    const protectionRate = strike > 0 ? strike : forwardRate;
    const expiryLabel = formatExpiry(daysToExpiry);
    const protectionCost =
      typeof premiumUSDC === "number" && Number.isFinite(premiumUSDC) && premiumUSDC > 0
        ? `$${premiumUSDC.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
        : "—";

    return (
      <Panel className="space-y-4 p-6">
        <section className="grid grid-cols-2 gap-1">
          <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
            <div className="text-[10px] font-semibold text-muted">Current rate</div>
            <div className="mt-0.5 text-[14px] font-semibold text-text">{formatWhole(safeSpot)}</div>
          </div>
          <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
            <div className="text-[10px] font-semibold text-muted">Protection rate</div>
            <div className="mt-0.5 text-[14px] font-semibold text-text">{formatWhole(protectionRate)}</div>
          </div>
          <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
            <div className="text-[10px] font-semibold text-muted">Expiry</div>
            <div className="mt-0.5 text-[14px] font-semibold text-text">{expiryLabel}</div>
          </div>
          <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
            <div className="text-[10px] font-semibold text-muted">Cost of protection</div>
            <div className="mt-0.5 text-[14px] font-semibold text-text">{protectionCost}</div>
          </div>
        </section>

        <p className="text-[12px] leading-[1.4] text-muted">
          You’re protected if NGN weakens beyond {formatWhole(protectionRate)}.
        </p>

        <div className="h-[340px] rounded-[12px] border border-border/70 bg-transparent px-0 py-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forwardPayoffData} margin={{ top: 6, right: 2, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="spotAtExpiry"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => formatWhole(value)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => formatWhole(value)}
                width={56}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border) / 0.7)",
                  backgroundColor: "hsl(var(--panel))",
                  fontSize: 11,
                  color: "hsl(var(--text))",
                }}
                labelFormatter={(value) => `USD/NGN @ Expiry ${formatTwo(Number(value))}`}
                formatter={(value: number) => [`${formatWhole(value)}`, "Payout"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted))" strokeDasharray="4 4" />
              <ReferenceLine
                x={protectionRate}
                stroke="hsl(var(--brand))"
                strokeDasharray="3 3"
                label={{
                  value: "Protection starts here",
                  position: "insideTopRight",
                  fill: "hsl(var(--muted))",
                  fontSize: 10,
                }}
              />
              <Line
                type="monotone"
                dataKey="payout"
                stroke="hsl(var(--brand))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "hsl(var(--brand))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    );
  }

  const safeStrike = Number.isFinite(strike) && strike > 0 ? strike : safeSpot;
  const hasPremium = typeof premiumUSDC === "number" && Number.isFinite(premiumUSDC);
  const breakeven = hasPremium ? safeStrike + premiumUSDC : null;
  const moneyness = !hasSpot
    ? "—"
    : `${((Math.abs(safeStrike / safeSpot - 1) * 100) as number).toFixed(2)}% ${
        optionType === "call" ? (safeStrike > safeSpot ? "OTM" : "ITM") : safeStrike < safeSpot ? "OTM" : "ITM"
      }`;

  const yValues = historyData.map((point) => point.spot).concat([safeStrike, breakeven ?? safeStrike]);
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const yPadding = Math.max(20, (yMaxRaw - yMinRaw) * 0.12);

  return (
    <Panel className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-text">{pair} {optionType === "call" ? "Call" : "Put"}</h3>
        <span className="rounded-full border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-cyan-200">
          PHYSICAL DELIVERY
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
          <div className="text-[10px] font-semibold text-muted">Spot (NGN per USD)</div>
          <div className="mt-0.5 text-[14px] font-semibold text-text">{hasSpot ? formatTwo(safeSpot) : "—"}</div>
        </div>
        <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
          <div className="text-[10px] font-semibold text-muted">Strike</div>
          <div className="mt-0.5 text-[14px] font-semibold text-text">{formatTwo(safeStrike)}</div>
        </div>
        <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
          <div className="text-[10px] font-semibold text-muted">OTM/ITM %</div>
          <div className="mt-0.5 text-[14px] font-semibold text-text">{moneyness}</div>
        </div>
        <div className="rounded-[10px] border border-border/70 bg-panel-2/50 px-2.5 py-2">
          <div className="text-[10px] font-semibold text-muted">Breakeven</div>
          <div className="mt-0.5 text-[14px] font-semibold text-text">{breakeven ? formatTwo(breakeven) : "—"}</div>
        </div>
      </div>

      <div className="h-[260px] rounded-[12px] border border-border/70 bg-transparent px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          {activeTab === "chart" ? (
            <LineChart data={historyData} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => new Date(value).toISOString().slice(5, 10)}
                minTickGap={26}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => formatWhole(value)}
                domain={[Math.max(0, yMinRaw - yPadding), yMaxRaw + yPadding]}
                width={52}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border) / 0.7)",
                  backgroundColor: "hsl(var(--panel))",
                  fontSize: 11,
                  color: "hsl(var(--text))",
                }}
                formatter={(value: number) => [`${formatTwo(value)} NGN/USD`, "Spot"]}
              />
              <ReferenceLine y={safeStrike} stroke="hsl(var(--muted))" strokeDasharray="4 4" />
              {breakeven ? <ReferenceLine y={breakeven} stroke="hsl(var(--muted))" strokeDasharray="3 3" /> : null}
              <Line
                type="monotone"
                dataKey="spot"
                stroke="hsl(var(--brand))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "hsl(var(--brand))" }}
              />
            </LineChart>
          ) : (
            <LineChart data={optionPayoffData} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="spot"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => formatWhole(value)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted))" }}
                tickFormatter={(value: number) => formatTwo(value)}
                width={52}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border) / 0.7)",
                  backgroundColor: "hsl(var(--panel))",
                  fontSize: 11,
                  color: "hsl(var(--text))",
                }}
                labelFormatter={(value) => `Spot ${formatTwo(Number(value))}`}
                formatter={(value: number) => [`${formatTwo(value)} USD`, "Profit @ Expiry"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted))" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="hsl(var(--brand))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "hsl(var(--brand))" }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <SegmentedControl
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "chart", label: "Chart" },
          { value: "payoff", label: "Payoff" },
        ]}
        className="grid-cols-2"
        optionClassName="h-6 text-[12px]"
      />

      <p className="text-[11px] leading-[1.35] text-muted">
        {optionType === "call"
          ? "Pays if USD rises above Strike at expiry (NGN weakens)."
          : "Pays if USD falls below Strike at expiry (NGN strengthens)."}
      </p>
    </Panel>
  );
}
