import type { ExchangeResume } from "@/lib/venue/exchange";
import type { ExchangeCurrency } from "@/lib/zeroex";

type Currency = ExchangeCurrency;

/** Where a stopped exchange's money is, kept per wallet in this browser so a reload can pick it up again. */
const RESUME_STORAGE_PREFIX = "numo.exchange.resume.";

export function saveResume(walletAddress: string, resume: ExchangeResume | null) {
  try {
    const key = RESUME_STORAGE_PREFIX + walletAddress.toLowerCase();
    if (resume === null) window.localStorage.removeItem(key);
    else {
      const units = resume.stage === "swap" ? resume.sellUnits : resume.units;
      window.localStorage.setItem(key, JSON.stringify({ ...resume, sellUnits: undefined, units: units.toString() }));
    }
  } catch {
    // Storage can be unavailable (private mode); the wallet notice still finds the money.
  }
}

export function loadResume(walletAddress: string): ExchangeResume | null {
  try {
    const raw = window.localStorage.getItem(RESUME_STORAGE_PREFIX + walletAddress.toLowerCase());
    if (!raw) return null;
    const saved = JSON.parse(raw) as { stage?: string; sell?: string; currency?: string; units?: string };
    const isCurrency = (code: unknown): code is Currency => code === "USDC" || code === "cNGN";
    if (!saved.units || !/^[0-9]+$/.test(saved.units)) return null;
    if (saved.stage === "swap" && isCurrency(saved.sell)) return { stage: "swap", sell: saved.sell, sellUnits: BigInt(saved.units) };
    if (saved.stage === "deposit" && isCurrency(saved.currency)) return { stage: "deposit", currency: saved.currency, units: BigInt(saved.units) };
  } catch {
    // An unreadable record is treated as none.
  }
  return null;
}

/** The amount a resume moves, and in which currency. */
export const resumeHolding = (resume: ExchangeResume) =>
  resume.stage === "swap" ? { currency: resume.sell, units: resume.sellUnits } : { currency: resume.currency, units: resume.units };

