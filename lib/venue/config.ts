import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

/**
 * The venue's Base mainnet stack, as trading-app's lib/matching-stack-defaults.json names it.
 * Command trades the same subaccounts as the trading app, so these must stay equal to its values.
 */
const MATCHING_ADDRESS = "0x9E90A9cD13d859Bd6a08168082FB1F6F7405F191";
const SUBACCOUNTS_ADDRESS = "0x7019244e25fa416e6ca2ed2f3ca25277aef72843";

/**
 * The manager spot and the cNGN future both settle under (/markets margin_manager_address). A
 * wallet's trading account is its subaccount under this manager.
 */
export const TRADING_MANAGER_ADDRESS = "0x0705219a1594d5Fc5dC2573da4082cAf3e1B0950";

/** The ledger assets an account's balances are held in: wrapped USDC cash, and cNGN. */
export const USDC_CASH_ASSET = "0xA74E49b4Ed7cb176bc02ef4D8a1A3240C9aD4272";
export const CNGN_ASSET = "0x37c976bb5d4887a714ef19AF6B83e34fe2f37c98";

/** The block Matching was deployed at: the subaccount scan stops here instead of at genesis. */
export const SUBACCOUNT_EVENT_FLOOR_BLOCK = 48_833_365n;

/** The public endpoint throttles hard, so a deployment sets NEXT_PUBLIC_BASE_RPC_URL to a keyed one. */
const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";

export const depositedSubAccountEvent = parseAbiItem(
  "event DepositedSubAccount(uint indexed accountId, address indexed owner)"
);

export function getAppChain() {
  return base;
}

export function getMatchingAddress() {
  return getAddress(MATCHING_ADDRESS);
}

export function getSubaccountsAddress() {
  return getAddress(SUBACCOUNTS_ADDRESS);
}

export function createBasePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || DEFAULT_BASE_RPC_URL),
  });
}

/** Blocks per `eth_getLogs` call. The public RPC takes 2,000; a keyed Alchemy endpoint takes 1,000,000. */
export function getLogQueryBlockRange() {
  const configured = process.env.NEXT_PUBLIC_LOG_QUERY_BLOCK_RANGE?.trim();
  try {
    const parsed = configured ? BigInt(configured) : 0n;
    return parsed > 0n ? parsed : 2000n;
  } catch {
    return 2000n;
  }
}

/** The trading app, where a trading account is opened and funded until command has deposits. */
export const TERMINAL_URL = "https://app.numofx.com";
