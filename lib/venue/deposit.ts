import type { ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeAbiParameters, encodeFunctionData, getAddress, hashStruct, parseAbi, parseUnits } from "viem";
import {
  CNGN_ASSET,
  TRADING_MANAGER_ADDRESS,
  USDC_CASH_ASSET,
  createBasePublicClient,
  getAppChain,
  getMatchingAddress,
} from "@/lib/venue/config";
import { createOrderNonce } from "@/lib/venue/order-envelope";

/** The venue's DepositModule on Base: it pulls the tokens and credits the trading account. */
const DEPOSIT_MODULE_ADDRESS = "0x6540f8d9Eb599b045C05E45cb6a5B1730a806658";
/** USDC on Base. Six decimals, and EIP-2612 permits, so a deposit needs no gas from the wallet. */
export const USDC_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
/** The venue refuses smaller USDC deposits. */
export const MIN_DEPOSIT_USDC = 10;

const DEPOSIT_SIGNATURE_LIFETIME_SECONDS = 30 * 60;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

const usdcAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
]);

/** The wallet's USDC on Base, in whole USDC. */
export async function readWalletUsdc(owner: string) {
  const units = await createBasePublicClient().readContract({
    abi: usdcAbi,
    address: USDC_TOKEN_ADDRESS,
    args: [getAddress(owner)],
    functionName: "balanceOf",
  });
  return Number(units) / 10 ** USDC_DECIMALS;
}

export type DepositRecord = {
  action_hash?: string;
  status?: string;
  accepted?: boolean;
  subaccount_id?: string;
  amount?: string;
  error?: string;
  revert?: string;
};

const SETTLED = new Set(["confirmed", "reverted", "rejected"]);

async function readDeposit(actionHash: string): Promise<DepositRecord | null> {
  try {
    const response = await fetch(`/api/venue/deposits/${actionHash}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as DepositRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Moves `amountUsdc` from the wallet into its trading account, opening one when `subaccountId` is
 * null. The wallet signs a USDC permit and the deposit action; the venue submits both and pays the
 * gas. Resolves with the venue's record once it is confirmed, reverted or rejected, or with the
 * last record read when it is still pending after the poll.
 */
export async function depositUsdc({
  amountUsdc,
  subaccountId,
  wallet,
}: {
  amountUsdc: string;
  subaccountId: string | null;
  wallet: ConnectedWallet;
}): Promise<DepositRecord> {
  const chain = getAppChain();
  await wallet.switchChain(chain.id);
  const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });
  const owner = getAddress(wallet.address);
  const amount = parseUnits(amountUsdc, USDC_DECIMALS);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + DEPOSIT_SIGNATURE_LIFETIME_SECONDS);

  const permitNonce = await createBasePublicClient().readContract({
    abi: usdcAbi,
    address: USDC_TOKEN_ADDRESS,
    args: [owner],
    functionName: "nonces",
  });
  const permitSignature = await walletClient.signTypedData({
    account: owner,
    domain: { name: "USD Coin", version: "2", chainId: chain.id, verifyingContract: USDC_TOKEN_ADDRESS },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner, spender: DEPOSIT_MODULE_ADDRESS, value: amount, nonce: permitNonce, deadline: expiry },
  });

  return submitDeposit({
    asset: USDC_CASH_ASSET,
    amount,
    expiry,
    permit: { value: amount.toString(), deadline: expiry.toString(), signature: permitSignature },
    subaccountId,
    wallet,
  });
}

/** cNGN on Base: six decimals and no EIP-2612 permit, so a cNGN deposit needs an approval sent first. */
export const CNGN_TOKEN_ADDRESS = "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F";
/** The venue refuses smaller cNGN deposits (DEPOSIT_ASSETS in the exchange repo's infra/aws/deposits.tf). */
export const MIN_DEPOSIT_CNGN = 15_000;

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** The call approving the DepositModule for `amountUnits` of cNGN, or null when the allowance already covers it. */
export async function cngnDepositApproval(owner: string, amountUnits: bigint) {
  const allowance = await createBasePublicClient().readContract({
    abi: erc20Abi,
    address: CNGN_TOKEN_ADDRESS,
    args: [getAddress(owner), DEPOSIT_MODULE_ADDRESS],
    functionName: "allowance",
  });
  if (allowance >= amountUnits) return null;
  return {
    to: CNGN_TOKEN_ADDRESS as `0x${string}`,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEPOSIT_MODULE_ADDRESS, amountUnits] }),
  };
}

/**
 * Moves `amountUnits` (six decimals) of the wallet's cNGN into its existing trading account. The
 * DepositModule must already be approved for it (`cngnDepositApproval`); the wallet signs only the
 * deposit action, and the venue submits it and pays the gas.
 */
export async function depositCngn({
  amountUnits,
  subaccountId,
  wallet,
}: {
  amountUnits: bigint;
  subaccountId: string;
  wallet: ConnectedWallet;
}): Promise<DepositRecord> {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + DEPOSIT_SIGNATURE_LIFETIME_SECONDS);
  return submitDeposit({ asset: CNGN_ASSET, amount: amountUnits, expiry, subaccountId, wallet });
}

/** Signs the DepositModule action for `amount` of `asset`, forwards it to the venue, and polls its record. */
async function submitDeposit({
  asset,
  amount,
  expiry,
  permit,
  subaccountId,
  wallet,
}: {
  asset: string;
  amount: bigint;
  expiry: bigint;
  permit?: { value: string; deadline: string; signature: string };
  subaccountId: string | null;
  wallet: ConnectedWallet;
}): Promise<DepositRecord> {
  const chain = getAppChain();
  await wallet.switchChain(chain.id);
  const walletClient = createWalletClient({ chain, transport: custom(await wallet.getEthereumProvider()) });
  const owner = getAddress(wallet.address);

  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "address" }],
    [amount, getAddress(asset), TRADING_MANAGER_ADDRESS]
  );
  const account = subaccountId ?? "0";
  const nonce = createOrderNonce();
  const typedData = {
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
    message: { subaccountId: BigInt(account), nonce, module: DEPOSIT_MODULE_ADDRESS, data, expiry, owner, signer: owner },
  } as const;
  const signature = await walletClient.signTypedData({ account: owner, ...typedData });
  // Matching.getActionHash: the struct hash, without the domain. The venue keys deposits by it.
  const fallbackHash = hashStruct({ types: typedData.types, primaryType: "Action", data: typedData.message });

  // Re-sending this same body never deposits twice, so a dropped response is retried as is.
  const body = JSON.stringify({
    action: {
      subaccount_id: account,
      nonce: nonce.toString(),
      module: DEPOSIT_MODULE_ADDRESS,
      data,
      expiry: expiry.toString(),
      owner,
      signer: owner,
    },
    signature,
    ...(permit ? { permit } : {}),
  });

  const response = await fetch("/api/venue/deposits", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  }).catch(() => null);
  let record = response ? ((await response.json().catch(() => null)) as DepositRecord | null) : null;
  if (response && !response.ok && response.status !== 202 && response.status !== 502) {
    throw new Error(record?.error || `The venue refused the deposit (${response.status})`);
  }

  const actionHash = record?.action_hash && /^0x[0-9a-fA-F]{64}$/.test(record.action_hash) ? record.action_hash : fallbackHash;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!(record?.status && SETTLED.has(record.status)) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    record = (await readDeposit(actionHash)) ?? record;
  }
  return record ?? { action_hash: actionHash, status: "unknown" };
}
