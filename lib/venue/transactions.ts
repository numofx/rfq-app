import { getAddress, isAddressEqual, parseAbiItem, toEventSelector, type Hash } from "viem";
import {
  CNGN_ASSET,
  SUBACCOUNT_EVENT_FLOOR_BLOCK,
  USDC_CASH_ASSET,
  createBasePublicClient,
  getSubaccountsAddress,
} from "@/lib/venue/config";

/** Every change to an account's balance of one asset, as the SubAccounts ledger records it. */
const balanceAdjusted = parseAbiItem(
  "event BalanceAdjusted(uint indexed accountId, address indexed manager, bytes32 indexed assetAndSubId, int amount, int preBalance, int postBalance, uint tradeId)"
);
const TRANSFER_TOPIC = toEventSelector(parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"));

/** The cNGN-30NOV26 future's asset, whose ledger balance is the position in whole contracts (1e18 each). */
const CNGN_FUTURE_ASSET = "0xcacee66ad41fd1472a47d7d5fe372ffbfac9aa75";
const CNGN_PER_FUTURE_CONTRACT = 1_000_000;

export type TransactionKind = "deposit" | "withdrawal" | "buy" | "sell" | "lock" | "settlement" | "other";

export type Transaction = {
  hash: Hash;
  time: number;
  kind: TransactionKind;
  /** Net change in the account, in whole units. Fees are folded into the USDC change. */
  usdc: number;
  cngn: number;
  /** Futures only: the change in position, in cNGN of notional (positive is long). */
  futureCngn: number;
};

/** `assetAndSubId` packs the asset's 20 bytes with a 12-byte sub id. */
function assetOf(assetAndSubId: Hash) {
  return getAddress(`0x${assetAndSubId.slice(2, 42)}`);
}

/**
 * What moved tokens between the owner's wallet and the venue in `hash`: a deposit pulls from the
 * wallet, a withdrawal pays it. Neither is a futures settlement, which only moves ledger cash.
 */
async function walletDirection(hash: Hash, owner: `0x${string}`): Promise<"in" | "out" | null> {
  const receipt = await createBasePublicClient().getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    const from = getAddress(`0x${log.topics[1]!.slice(26)}`);
    const to = getAddress(`0x${log.topics[2]!.slice(26)}`);
    if (isAddressEqual(from, owner)) return "in";
    if (isAddressEqual(to, owner)) return "out";
  }
  return null;
}

/**
 * The account's history, newest first, read from the ledger's events and grouped by transaction.
 * The kind comes from what moved: both legs of a spot pair is an exchange, a futures leg is a lock,
 * and one cash leg is a deposit or withdrawal when it touched the wallet, else a settlement.
 */
export async function readTransactions(subaccountId: string, ownerAddress: string): Promise<Transaction[]> {
  const client = createBasePublicClient();
  const owner = getAddress(ownerAddress);
  const logs = await client.getLogs({
    address: getSubaccountsAddress(),
    event: balanceAdjusted,
    args: { accountId: BigInt(subaccountId) },
    fromBlock: SUBACCOUNT_EVENT_FLOOR_BLOCK,
    toBlock: await client.getBlockNumber(),
  });

  const byHash = new Map<Hash, { block: bigint; usdc: number; cngn: number; futureCngn: number; other: boolean }>();
  for (const log of logs) {
    const entry = byHash.get(log.transactionHash) ?? { block: log.blockNumber, usdc: 0, cngn: 0, futureCngn: 0, other: false };
    const asset = assetOf(log.args.assetAndSubId as Hash);
    const amount = Number(log.args.amount ?? 0n) / 1e18;
    if (isAddressEqual(asset, USDC_CASH_ASSET)) entry.usdc += amount;
    else if (isAddressEqual(asset, CNGN_ASSET)) entry.cngn += amount;
    else if (isAddressEqual(asset, CNGN_FUTURE_ASSET)) entry.futureCngn += amount * CNGN_PER_FUTURE_CONTRACT;
    else entry.other = true;
    byHash.set(log.transactionHash, entry);
  }

  const blocks = [...new Set([...byHash.values()].map((entry) => entry.block))];
  const times = new Map(
    await Promise.all(blocks.map(async (number) => [number, Number((await client.getBlock({ blockNumber: number })).timestamp) * 1000] as const))
  );

  const transactions = await Promise.all(
    [...byHash.entries()].map(async ([hash, entry]): Promise<Transaction> => {
      let kind: TransactionKind = "other";
      if (entry.futureCngn !== 0) kind = "lock";
      else if (entry.cngn !== 0 && entry.usdc !== 0) kind = entry.cngn > 0 ? "buy" : "sell";
      else if (!entry.other && (entry.usdc !== 0 || entry.cngn !== 0)) {
        const direction = await walletDirection(hash, owner).catch(() => null);
        kind = direction === "in" ? "deposit" : direction === "out" ? "withdrawal" : "settlement";
      }
      return { hash, time: times.get(entry.block) ?? 0, kind, usdc: entry.usdc, cngn: entry.cngn, futureCngn: entry.futureCngn };
    })
  );
  return transactions.sort((a, b) => b.time - a.time);
}
