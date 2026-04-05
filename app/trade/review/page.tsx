"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, CircleDollarSign, Percent, TrendingUp } from "lucide-react";

type OptionType = "call" | "put";
type Pair = "USD/NGN" | "USD/KES" | "USDC/cNGN" | "USD/EGP" | "USD/GHS" | "USD/ZMW";

function formatPairLabel(pair: string) {
  return pair.replace("/", " / ");
}

function formatExpiry(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatUsd(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatUsd0(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 py-6">
      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{value}</div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const data = useMemo(() => {
    const pair = (sp.get("pair") || "USD/NGN") as Pair;
    const type = (sp.get("type") || "call") as OptionType;
    const notional = Number(sp.get("notional") || "0") || 0;
    const strike = Number(sp.get("strike") || "0") || 0;
    const expiry = sp.get("expiry") || new Date().toISOString().slice(0, 10);
    const indicative = Number(sp.get("indicative") || "0") || 0;

    const scenario =
      pair === "USD/KES"
        ? { up: 160, flat: 130 }
        : pair === "USD/EGP"
          ? { up: 58, flat: 50 }
          : pair === "USD/GHS"
            ? { up: 18, flat: 15 }
            : pair === "USD/ZMW"
              ? { up: 34, flat: 28 }
        : { up: 2600, flat: 1500 };
    const contractCount = notional > 0 ? notional / Math.max(strike, 0.0001) : 0;
    const premium = contractCount * indicative;
    const premiumPct = notional > 0 ? (premium / notional) * 100 : 0;

    const payout = (spotAtExpiry: number) => {
      if (type === "call") return Math.max(spotAtExpiry - strike, 0) * contractCount;
      return Math.max(strike - spotAtExpiry, 0) * contractCount;
    };

    const maxPayout =
      type === "call"
        ? `Unlimited above ${strike.toLocaleString("en-US")}`
        : `Unlimited below ${strike.toLocaleString("en-US")}`;

    return {
      pair,
      notional,
      strike,
      expiry,
      scenario,
      premium,
      premiumPct,
      payoutUp: payout(scenario.up),
      payoutFlat: payout(scenario.flat),
      maxPayout,
    };
  }, [sp]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(0,0,0,0.06),transparent_55%),linear-gradient(180deg,#fbf7f0,rgba(248,243,234,0.9))] px-6 py-10">
      <div className="mx-auto w-full max-w-[520px]">
        <div className="rounded-[36px] bg-white/70 p-6 shadow-[0_22px_70px_rgba(15,23,42,0.18)] backdrop-blur-sm md:p-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 transition hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="mt-8">
            <div className="text-[28px] font-semibold tracking-tight text-neutral-900">
              Review Transaction
            </div>
            <div className="mt-1 text-sm text-neutral-500">{formatPairLabel(data.pair)}</div>
          </div>

          <div className="mt-8 rounded-3xl border border-black/10 bg-white/80 px-6 shadow-[0_10px_35px_rgba(15,23,42,0.10)]">
            <div className="divide-y divide-black/5">
              <SummaryRow
                icon={<CircleDollarSign className="h-4 w-4 text-neutral-600" />}
                label="Notional (USD)"
                value={formatUsd0(data.notional)}
              />
              <SummaryRow
                icon={<Calendar className="h-4 w-4 text-neutral-600" />}
                label="Expiry"
                value={formatExpiry(data.expiry)}
              />
              <SummaryRow
                icon={<Percent className="h-4 w-4 text-neutral-600" />}
                label="Premium"
                value={`${formatUsd(data.premium)} (${data.premiumPct.toFixed(3)}%)`}
              />
              <SummaryRow
                icon={<TrendingUp className="h-4 w-4 text-neutral-600" />}
                label="Max payout"
                value={data.maxPayout}
              />
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-black/10 bg-white/70 px-6 py-5">
            <div className="text-sm font-semibold text-neutral-600">Scenario Preview</div>
            <div className="mt-3 space-y-2 text-sm text-neutral-700">
              <div>
                If {formatPairLabel(data.pair)} hits {data.scenario.up.toLocaleString("en-US")} {"\u2192"} payout{" "}
                {"\u2248"} {formatUsd0(data.payoutUp)}
              </div>
              <div>
                If {formatPairLabel(data.pair)} stays at {data.scenario.flat.toLocaleString("en-US")} {"\u2192"} payout{" "}
                = {formatUsd0(data.payoutFlat)}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-10 w-full rounded-2xl bg-black py-5 text-lg font-semibold text-white shadow-[0_14px_35px_rgba(0,0,0,0.28)] transition hover:bg-neutral-900"
          >
            Request Quote
          </button>
        </div>
      </div>
    </div>
  );
}
