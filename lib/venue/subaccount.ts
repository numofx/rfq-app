// The lookup and cache are ported from trading-app useTradingSubaccount.ts and
// trading-subaccount-cache.ts, and the ledger read from useSubaccountBalance.ts.
import { getAddress, isAddressEqual, parseAbi } from "viem";
import {
  CNGN_ASSET,
  SUBACCOUNT_EVENT_FLOOR_BLOCK,
  USDC_CASH_ASSET,
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
export async function readLedgerBalances(subaccountId: string, blockNumber?: bigint) {
  const rows = await createBasePublicClient().readContract({
    abi: getAccountBalancesAbi,
    address: getSubaccountsAddress(),
    args: [BigInt(subaccountId)],
    blockNumber,
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

/**
 * Base's block time has changed over the venue's life (it is no longer two seconds), so a time maps
 * to a block by interpolating between real block timestamps. Anchors sit at doubling distances back
 * from the head, so recent times, the ones a chart shows most of, land within a few hundred blocks.
 */
const NEAREST_ANCHOR_BLOCKS = 512n;
const HISTORY_CONCURRENCY = 8;

async function blockClock() {
  const client = createBasePublicClient();
  const head = await client.getBlock();
  const numbers = [SUBACCOUNT_EVENT_FLOOR_BLOCK];
  for (let distance = head.number - SUBACCOUNT_EVENT_FLOOR_BLOCK; distance >= NEAREST_ANCHOR_BLOCKS; distance /= 2n) {
    numbers.push(head.number - distance);
  }
  numbers.push(head.number);
  const anchors = await Promise.all(
    numbers.map(async (blockNumber) =>
      blockNumber === head.number ? head : client.getBlock({ blockNumber })
    )
  );
  const points = anchors.map((block) => ({ number: block.number, ms: Number(block.timestamp) * 1000 }));

  /** The last block at or before `ms`, or null before Matching was deployed. */
  return function blockAt(ms: number): bigint | null {
    if (ms < points[0].ms) return null;
    for (let index = 1; index < points.length; index += 1) {
      const low = points[index - 1];
      const high = points[index];
      if (ms <= high.ms) {
        const fraction = (ms - low.ms) / Math.max(1, high.ms - low.ms);
        return low.number + BigInt(Math.floor(Number(high.number - low.number) * fraction));
      }
    }
    return points[points.length - 1].number;
  };
}

export type BalancePoint = { time: number; usdc: number; cngn: number };

/**
 * The account's USDC and cNGN at `points` evenly spaced times from `startMs` to now, read from the
 * ledger at the block for each time. Before the account existed, or before Matching was deployed,
 * a point is zero.
 */
export async function readBalanceHistory(subaccountId: string, startMs: number, points: number): Promise<BalancePoint[]> {
  const blockAt = await blockClock();
  const nowMs = Date.now();
  const step = (nowMs - startMs) / (points - 1);
  const times = Array.from({ length: points }, (_, index) => Math.round(startMs + step * index));

  const results: BalancePoint[] = new Array(points);
  let next = 0;
  async function worker() {
    while (next < points) {
      const index = next++;
      const time = times[index];
      const block = index === points - 1 ? undefined : blockAt(time);
      if (block === null) {
        results[index] = { time, usdc: 0, cngn: 0 };
        continue;
      }
      const balanceOf = await readLedgerBalances(subaccountId, block).catch(() => null);
      results[index] = {
        time,
        usdc: balanceOf ? Number(balanceOf(USDC_CASH_ASSET)) / 1e18 : 0,
        cngn: balanceOf ? Number(balanceOf(CNGN_ASSET)) / 1e18 : 0,
      };
    }
  }
  await Promise.all(Array.from({ length: HISTORY_CONCURRENCY }, worker));
  return results;
}
