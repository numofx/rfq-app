// Ported from trading-app lib/withdrawal-submission.ts: the same signed action, and the same reading of the
// venue's answer, so both apps withdraw from a trading account the same way.
import type { ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeAbiParameters, getAddress } from "viem";
import { CNGN_ASSET, USDC_CASH_ASSET, getAppChain, getMatchingAddress } from "@/lib/venue/config";
import { createOrderNonce } from "@/lib/venue/order-envelope";

/** The venue's WithdrawalModule on Base. It pays the tokens to the account's owner, never anyone else. */
const WITHDRAWAL_MODULE_ADDRESS = "0x0a10AE2f5D2482cE1e43bC309D430B8861C2b5aB";
/** Long enough for the venue to submit it, short because a live signature is an authorization to move funds. */
const WITHDRAWAL_SIGNATURE_LIFETIME_SECONDS = 10 * 60;
/** Both tokens have six decimals; the ledger keeps 18. */
export const TOKEN_DECIMALS = 6;

/** The ledger asset each balance is held in. The venue pays out the token behind it. */
export const WITHDRAWAL_ASSETS = { USDC: USDC_CASH_ASSET, cNGN: CNGN_ASSET } as const;

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type WithdrawalOutcome =
  | { kind: "settled"; txHash: string }
  | { kind: "pending"; txHash: string }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown"; reason: string };

const REVERT_COPY: Record<string, (currency: string) => string> = {
  BM_NonceAlreadyUsed: () => "This signed withdrawal was already used. Check your balance before signing another.",
  OV_ActionExpired: () => "The signature expired before the venue could submit it. Try again.",
  SRM_NoNegativeCash: (currency) => `That is more ${currency} than the account can withdraw.`,
  SRM_PortfolioBelowMargin: () => "Withdrawing this much would leave the account below its margin requirement.",
  WERC_CannotBeNegative: (currency) => `That is more ${currency} than the account holds.`,
};

const UNKNOWN_OUTCOME =
  "The venue could not confirm whether the withdrawal went through. Check your wallet balance before trying again.";

type ResponseBody = { accepted?: unknown; error?: unknown; receipt_status?: unknown; revert?: unknown; tx_hash?: unknown };

/** Whether anything was sent: a refusal says nothing was, and an unknown outcome says check before signing again. */
function interpret(status: number, body: ResponseBody, currency: string): WithdrawalOutcome {
  const error = typeof body.error === "string" ? body.error : undefined;
  const revert = typeof body.revert === "string" ? body.revert : undefined;
  const rejected = (reason: string): WithdrawalOutcome => ({
    kind: "rejected",
    reason: `${reason.replace(/\.?$/, ".")} Nothing was sent.`,
  });

  if (status === 200) {
    if (typeof body.tx_hash !== "string" || !TX_HASH_PATTERN.test(body.tx_hash)) {
      return { kind: "unknown", reason: UNKNOWN_OUTCOME };
    }
    if (body.receipt_status === "reverted") return rejected("The withdrawal transaction reverted");
    if (body.receipt_status === "success" && body.accepted === true) return { kind: "settled", txHash: body.tx_hash };
    return { kind: "pending", txHash: body.tx_hash };
  }
  switch (status) {
    case 400:
      return rejected(error ?? "The venue refused the withdrawal");
    case 401:
      return rejected("Your signature was not accepted");
    case 403:
      return rejected("This wallet is not the owner of the trading account");
    case 404:
    case 503:
      return rejected("Withdrawals are temporarily unavailable");
    case 422: {
      if (revert?.includes("transfer amount exceeds balance")) {
        return rejected(`The venue's ${currency} escrow is short of tokens, so this withdrawal cannot settle right now`);
      }
      const copy = revert === undefined ? undefined : REVERT_COPY[revert];
      return rejected(copy ? copy(currency) : (error ?? "The venue refused the withdrawal"));
    }
    case 429:
      return rejected("A withdrawal is already in progress. Wait for it to finish, then try again");
    default:
      return { kind: "unknown", reason: UNKNOWN_OUTCOME };
  }
}

/**
 * Withdraws `amountUnits` (six decimals) of `currency` from the trading account to the wallet that owns it.
 * The wallet signs a WithdrawalModule action, which costs no gas; the venue simulates and submits it.
 */
export async function withdraw({
  amountUnits,
  currency,
  subaccountId,
  wallet,
}: {
  amountUnits: bigint;
  currency: keyof typeof WITHDRAWAL_ASSETS;
  subaccountId: string;
  wallet: ConnectedWallet;
}): Promise<WithdrawalOutcome> {
  if (amountUnits <= 0n) throw new Error("Enter an amount");
  const chain = getAppChain();
  await wallet.switchChain(chain.id);
  const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });

  const owner = getAddress(wallet.address);
  const nonce = createOrderNonce();
  const expiry = BigInt(Math.floor(Date.now() / 1000) + WITHDRAWAL_SIGNATURE_LIFETIME_SECONDS);
  const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [WITHDRAWAL_ASSETS[currency], amountUnits]);

  const signature = await walletClient.signTypedData({
    account: owner,
    domain: { name: "Matching", version: "1.0", chainId: chain.id, verifyingContract: getMatchingAddress() },
    types: {
      Action: [
        { name: "subaccountId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "module", type: "address" },
        { name: "data", type: "bytes" },
        { name: "expiry", type: "uint256" },
        { name: "owner", type: "address" },
        { name: "signer", type: "address" },
      ],
    },
    primaryType: "Action",
    message: { subaccountId: BigInt(subaccountId), nonce, module: WITHDRAWAL_MODULE_ADDRESS, data, expiry, owner, signer: owner },
  });

  const response = await fetch("/api/venue/withdrawals", {
    body: JSON.stringify({
      action: {
        subaccount_id: subaccountId,
        nonce: nonce.toString(),
        module: WITHDRAWAL_MODULE_ADDRESS,
        data,
        expiry: expiry.toString(),
        owner,
        signer: owner,
      },
      signature,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }).catch(() => null);
  if (!response) return { kind: "unknown", reason: UNKNOWN_OUTCOME };
  const body = ((await response.json().catch(() => null)) ?? {}) as ResponseBody;
  return interpret(response.status, body, currency);
}
