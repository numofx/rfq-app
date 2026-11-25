import type { ConnectedWallet } from "@privy-io/react-auth";
import { encodeFunctionData, formatUnits, getAddress, isAddressEqual, parseAbi, parseEventLogs, type Hash, type TransactionReceipt } from "viem";
import { createBasePublicClient } from "@/lib/venue/config";
import { cngnDepositApproval, depositCngn, depositUsdc, MIN_DEPOSIT_CNGN, MIN_DEPOSIT_USDC, type DepositRecord } from "@/lib/venue/deposit";
import { withdraw } from "@/lib/venue/withdraw";
import { EXCHANGE_TOKENS, fetchZeroExQuote, type ExchangeCurrency } from "@/lib/zeroex";

/**
 * An exchange between the trading account's two balances, priced and routed by 0x. 0x can only swap tokens a
 * wallet holds, so it runs in three steps: withdraw the sell side to the wallet (a signed action, venue gas), swap
 * it through 0x's AllowanceHolder (wallet transactions, gas sponsored for the embedded wallet), and deposit what
 * the swap paid back into the account (a signed action, venue gas; cNGN needs an approval first).
 *
 * Between steps the money sits in the wallet. When a step fails, `ExchangeStopped.resume` says exactly what is
 * there and which step picks it up, so the dialog can continue, or return it to the account, without guessing.
 */

export const OTHER_CURRENCY: Record<ExchangeCurrency, ExchangeCurrency> = { USDC: "cNGN", cNGN: "USDC" };
/** The venue's smallest deposit of each token, in whole units: what an exchange must at least pay out. */
export const MIN_DEPOSIT: Record<ExchangeCurrency, number> = { USDC: MIN_DEPOSIT_USDC, cNGN: MIN_DEPOSIT_CNGN };

const RECEIPT_TIMEOUT_MS = 90_000;

export type ExchangeResume =
  /** `sellUnits` of `sell` reached the wallet; the swap has not happened. */
  | { stage: "swap"; sell: ExchangeCurrency; sellUnits: bigint }
  /** `units` of `currency` are in the wallet, waiting to go back into the trading account. */
  | { stage: "deposit"; currency: ExchangeCurrency; units: bigint };

/** A step failed after money had left the trading account. `resume` is where it is now. */
export class ExchangeStopped extends Error {
  constructor(
    message: string,
    readonly resume: ExchangeResume
  ) {
    super(message);
  }
}

/** Sends one wallet transaction and resolves with its hash. Supplied by the dialog, which holds the Privy hook. */
export type SendCall = (call: { to: `0x${string}`; data: `0x${string}`; value?: bigint; gas?: bigint }) => Promise<Hash>;

type Context = {
  subaccountId: string;
  wallet: ConnectedWallet;
  sendCall: SendCall;
  onProgress: (text: string) => void;
};

const amountText = (currency: ExchangeCurrency, units: bigint) =>
  `${Number(formatUnits(units, EXCHANGE_TOKENS[currency].decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency === "USDC" ? "USD" : "NGN"}`;

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

/** An error's one-line reason: viem's `shortMessage`, never its full text, which carries the request and calldata. */
function errorText(error: unknown) {
  if (typeof error === "object" && error !== null && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message.split("\n")[0] : "";
}

async function waitForReceipt(hash: Hash): Promise<TransactionReceipt | null> {
  try {
    return await createBasePublicClient().waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  } catch {
    return null;
  }
}

/** Sends `call` and waits for it to succeed; throws `stopped` when it is refused, reverts, or cannot be confirmed. */
async function sendAndConfirm(context: Context, call: Parameters<SendCall>[0], stopped: (reason: string) => ExchangeStopped) {
  let hash: Hash;
  try {
    hash = await context.sendCall(call);
  } catch (error) {
    // The full error goes to the console; the dialog quotes the wallet's own reason rather than a guess at it.
    console.error("[exchange] the wallet did not send", call.to, error);
    const message = errorText(error);
    throw stopped(message ? `The wallet didn't send it: ${message.replace(/\.$/, "")}` : "The wallet didn't send the transaction");
  }
  const receipt = await waitForReceipt(hash);
  if (receipt === null) throw stopped("The transaction wasn't confirmed in time");
  if (receipt.status !== "success") throw stopped("The transaction reverted");
  return receipt;
}

/** What `receipt` paid `owner` in `currency`: the sum of the token's Transfer logs to it. */
function receivedUnits(receipt: TransactionReceipt, currency: ExchangeCurrency, owner: `0x${string}`) {
  const token = EXCHANGE_TOKENS[currency].address;
  return parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter((log) => isAddressEqual(log.address, token) && isAddressEqual(log.args.to, owner))
    .reduce((sum, log) => sum + log.args.value, 0n);
}

async function withdrawStep(context: Context, sell: ExchangeCurrency, sellUnits: bigint) {
  context.onProgress("Withdrawing from your account");
  const outcome = await withdraw({ amountUnits: sellUnits, currency: sell, subaccountId: context.subaccountId, wallet: context.wallet });
  if (outcome.kind === "rejected" || outcome.kind === "unknown") throw new Error(outcome.reason);
  if (outcome.kind === "pending") {
    const receipt = await waitForReceipt(outcome.txHash as Hash);
    if (receipt === null) {
      throw new Error("The venue hasn't confirmed the withdrawal yet. Check your balance before trying again.");
    }
    if (receipt.status !== "success") throw new Error("The withdrawal reverted. Nothing was exchanged.");
  }
}

async function swapStep(context: Context, sell: ExchangeCurrency, sellUnits: bigint): Promise<bigint> {
  const owner = getAddress(context.wallet.address);
  const buy = OTHER_CURRENCY[sell];
  const stopped = (reason: string) =>
    new ExchangeStopped(`${reason.replace(/\.?$/, ".")} Your ${amountText(sell, sellUnits)} is in your wallet.`, {
      stage: "swap",
      sell,
      sellUnits,
    });

  context.onProgress("Getting a firm quote");
  let quote;
  try {
    quote = await fetchZeroExQuote({ sell, sellUnits, taker: owner });
  } catch (error) {
    throw stopped(errorText(error) || "The quote failed");
  }
  if (!quote.liquidityAvailable || !quote.transaction) throw stopped("There isn't enough liquidity for this amount right now");
  const minimum = BigInt(MIN_DEPOSIT[buy]) * 10n ** BigInt(EXCHANGE_TOKENS[buy].decimals);
  if (BigInt(quote.minBuyAmount) < minimum) {
    throw stopped(`This would pay out less than the ${amountText(buy, minimum)} the account accepts`);
  }

  const allowance = quote.issues?.allowance;
  if (allowance && BigInt(allowance.actual) < sellUnits) {
    context.onProgress(`Approving ${sell === "USDC" ? "USD" : "NGN"} for the exchange`);
    await sendAndConfirm(
      context,
      {
        to: EXCHANGE_TOKENS[sell].address,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [getAddress(allowance.spender), sellUnits] }),
      },
      stopped
    );
  }

  context.onProgress("Exchanging");
  const receipt = await sendAndConfirm(
    context,
    {
      to: quote.transaction.to,
      data: quote.transaction.data,
      value: BigInt(quote.transaction.value || "0"),
      // 0x's limit, not an estimate: a pool hook on the cNGN route reverts ("IG") when the
      // transaction runs with too little headroom, which an estimated limit leaves it. Fork-checked.
      gas: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
    },
    stopped
  );
  const received = receivedUnits(receipt, buy, owner);
  if (received === 0n) {
    // The swap went through but its logs don't show the payout: the sell side is spent, so there is nothing to retry.
    throw new Error(`The exchange went through, but its payout couldn't be read. Check your wallet's ${buy === "USDC" ? "USD" : "NGN"} before depositing it.`);
  }
  return received;
}

async function depositStep(context: Context, currency: ExchangeCurrency, units: bigint) {
  const stopped = (reason: string) =>
    new ExchangeStopped(`${reason.replace(/\.?$/, ".")} Your ${amountText(currency, units)} is in your wallet.`, {
      stage: "deposit",
      currency,
      units,
    });
  let record: DepositRecord;
  try {
    if (currency === "USDC") {
      context.onProgress("Depositing into your account");
      record = await depositUsdc({ amountUsdc: formatUnits(units, 6), subaccountId: context.subaccountId, wallet: context.wallet });
    } else {
      const approval = await cngnDepositApproval(context.wallet.address, units);
      if (approval) {
        context.onProgress("Approving NGN for the deposit");
        await sendAndConfirm(context, approval, stopped);
      }
      context.onProgress("Depositing into your account");
      record = await depositCngn({ amountUnits: units, subaccountId: context.subaccountId, wallet: context.wallet });
    }
  } catch (error) {
    if (error instanceof ExchangeStopped) throw error;
    throw stopped(errorText(error) || "The deposit failed");
  }
  if (record.status === "confirmed" && record.accepted !== false) return;
  if (record.status === "reverted" || record.status === "rejected") {
    throw stopped(record.revert || record.error || "The venue refused the deposit");
  }
  throw stopped("The deposit hasn't confirmed yet. Check your balance before trying again");
}

/**
 * Exchanges `sellUnits` of `sell` held in the trading account for the other currency, or, given `resume`,
 * continues one that stopped. Resolves with what was deposited back.
 */
export async function runExchange(
  context: Context,
  start: { stage: "withdraw"; sell: ExchangeCurrency; sellUnits: bigint } | ExchangeResume
): Promise<{ currency: ExchangeCurrency; units: bigint }> {
  let step = start;
  if (step.stage === "withdraw") {
    await withdrawStep(context, step.sell, step.sellUnits);
    step = { stage: "swap", sell: step.sell, sellUnits: step.sellUnits };
  }
  if (step.stage === "swap") {
    const units = await swapStep(context, step.sell, step.sellUnits);
    step = { stage: "deposit", currency: OTHER_CURRENCY[step.sell], units };
  }
  await depositStep(context, step.currency, step.units);
  return { currency: step.currency, units: step.units };
}
