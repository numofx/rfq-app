import { encodeFunctionData, getAddress, isAddress, isAddressEqual, parseAbi, parseUnits, type Hash } from "viem";
import { createBasePublicClient } from "@/lib/venue/config";
import { USDC_TOKEN_ADDRESS } from "@/lib/venue/deposit";

const USDC_DECIMALS = 6;
const RECEIPT_TIMEOUT_MS = 60_000;

const transferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

/** Why `recipient` can't be sent to from `owner`, or null when it can. */
export function recipientProblem(recipient: string, owner: string | null): string | null {
  const trimmed = recipient.trim();
  if (trimmed === "") return null;
  if (!isAddress(trimmed, { strict: false })) return "That isn't a valid address";
  if (owner && isAddressEqual(getAddress(trimmed), getAddress(owner))) return "That's your own wallet";
  if (isAddressEqual(getAddress(trimmed), USDC_TOKEN_ADDRESS)) return "That's the USDC contract, not a wallet";
  return null;
}

/** The call that moves `amountUsdc` of the wallet's USDC to `recipient`. */
export function usdcTransfer(recipient: string, amountUsdc: string) {
  return {
    to: USDC_TOKEN_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
      abi: transferAbi,
      functionName: "transfer",
      args: [getAddress(recipient.trim()), parseUnits(amountUsdc, USDC_DECIMALS)],
    }),
  };
}

/** Waits for the transfer to be mined: true when it succeeded, null when it hasn't been seen in time. */
export async function waitForTransfer(hash: Hash): Promise<boolean | null> {
  try {
    const receipt = await createBasePublicClient().waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    return receipt.status === "success";
  } catch {
    return null;
  }
}
