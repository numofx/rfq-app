// The lookup and cache are ported from trading-app useTradingSubaccount.ts and
// trading-subaccount-cache.ts, and the ledger read from useSubaccountBalance.ts.
import { getAddress, isAddressEqual, parseAbi } from "viem";
import {
  SUBACCOUNT_EVENT_FLOOR_BLOCK,
  createBasePublicClient,
  depositedSubAccountEvent,
  getAppChain,
  getLogQueryBlockRange,
  getMatchingAddress,
  getSubaccountsAddress,
} from "@/lib/venue/config";

/** A cached result re-scans this far below its last block, so a reorg cannot drop an event. */
const REORG_SAFETY_BLOCKS = 2000n;
const CACHE_PREFIX = "numo.trading-subaccount.v1";
const BLOCK_NUMBER_PATTERN = /^\d+$/;

/** The SubAccounts ledger keeps every asset in 18 decimals, USDC included. */
export const LEDGER_DECIMALS = 18;

type ScanCache = { subaccountId: string | null; scannedToBlock: string };

const subAccountManagerAbi = parseAbi(["function manager(uint256 accountId) view returns (address)"]);

const getAccountBalancesAbi = parseAbi([
  "struct AssetBalance { address asset; uint256 subId; int256 balance; }",
  "function getAccountBalances(uint256 accountId) view returns (AssetBalance[])",
]);

/** The same key trading-app writes, so a lookup either app finishes saves the other a rescan. */
function cacheKey(ownerAddress: string, managerAddress: string) {
  return [
    CACHE_PREFIX,
    String(getAppChain().id),
    getMatchingAddress().toLowerCase(),
    managerAddress.toLowerCase(),
    ownerAddress.toLowerCase(),
  ].join(".");
}

function readCache(key: string): ScanCache | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<ScanCache> | null;
    if (
      parsed &&
      typeof parsed.scannedToBlock === "string" &&
      BLOCK_NUMBER_PATTERN.test(parsed.scannedToBlock) &&
      (parsed.subaccountId === null || typeof parsed.subaccountId === "string")
    ) {
      return { scannedToBlock: parsed.scannedToBlock, subaccountId: parsed.subaccountId };
    }
  } catch {
    // Unavailable storage only costs a rescan.
  }
  return null;
}

function writeCache(key: string, value: ScanCache) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // As above.
  }
}

/**
 * The owner's newest subaccount under `manager`, or null. An account's manager is fixed when it is
 * opened, so an older account under a retired manager is skipped: it could never settle these markets.
 */
async function scanForSubaccountId(owner: `0x${string}`, latestBlock: bigint, floorBlock: bigint, manager: `0x${string}`) {
  const client = createBasePublicClient();
  const blockRange = getLogQueryBlockRange();
  let windowEnd = latestBlock;

  while (windowEnd >= floorBlock) {
    const rangeStart = windowEnd > blockRange ? windowEnd - blockRange + 1n : 0n;
    const windowStart = rangeStart > floorBlock ? rangeStart : floorBlock;
    const logs = await client.getLogs({
      address: getMatchingAddress(),
      event: depositedSubAccountEvent,
      fromBlock: windowStart,
      toBlock: windowEnd,
      args: { owner },
    });

    for (const log of [...logs].reverse()) {
      const accountId = log.args.accountId;
      if (accountId === undefined) continue;
      const accountManager = await client.readContract({
        abi: subAccountManagerAbi,
        address: getSubaccountsAddress(),
        args: [accountId],
        functionName: "manager",
      });
      if (isAddressEqual(accountManager, manager)) {
        return accountId.toString();
      }
    }

    if (windowStart === floorBlock) return null;
    windowEnd = windowStart - 1n;
  }
  return null;
}

/** The wallet's trading subaccount under `manager`, scanning only blocks since the last lookup. */
export async function findTradingSubaccountId(ownerAddress: string, manager: `0x${string}`) {
  const owner = getAddress(ownerAddress);
  const latestBlock = await createBasePublicClient().getBlockNumber();
  const key = cacheKey(owner, manager);
  const cached = readCache(key);

  let floor = SUBACCOUNT_EVENT_FLOOR_BLOCK;
  if (cached && BigInt(cached.scannedToBlock) <= latestBlock) {
    const resume = BigInt(cached.scannedToBlock) - REORG_SAFETY_BLOCKS;
    floor = resume > floor ? resume : floor;
  }

  const found = await scanForSubaccountId(owner, latestBlock, floor, manager);
  const resolved = found ?? (floor === SUBACCOUNT_EVENT_FLOOR_BLOCK ? null : (cached?.subaccountId ?? null));
  writeCache(key, { scannedToBlock: latestBlock.toString(), subaccountId: resolved });
  return resolved;
}

/** One asset's balance on the subaccount, in the ledger's 1e18 units. Absent from the ledger is zero. */
export async function readLedgerBalances(subaccountId: string) {
  const rows = await createBasePublicClient().readContract({
    abi: getAccountBalancesAbi,
    address: getSubaccountsAddress(),
    args: [BigInt(subaccountId)],
    functionName: "getAccountBalances",
  });
  return (asset: `0x${string}`) => {
    let balance = 0n;
    for (const row of rows) {
      if (isAddressEqual(row.asset, asset)) balance = row.balance;
    }
    return balance;
  };
}
