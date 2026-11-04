"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ACCOUNTS } from "@/components/dashboard/account-cards";
import { cn } from "@/lib/utils";

const DESCRIPTION_MAX = 80;
const UNTIL_MONTHS = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"];
// No flow behind these yet.
const SOON_ACTIONS = ["Direct", "Request", "Deposit", "Withdraw", "Transfer"];

const MENU_ITEM =
  "flex h-[42px] items-center justify-between rounded-lg px-3 text-[15px] text-[#141414] outline-none dark:text-white";
const MENU_CONTENT =
  "z-50 rounded-2xl bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:bg-[#1A1A1A]";
const FIELD_LABEL = "text-[14px] text-[#141414] dark:text-white";
const FIELD_LINE = "mt-2 flex h-10 w-full items-center border-b border-black/10 dark:border-white/10";
const FIELD_INPUT =
  "w-full min-w-0 bg-transparent text-[15px] text-[#141414] outline-none placeholder:text-black/35 dark:text-white dark:placeholder:text-white/35";

/** Mounted only while the dialog is open, so closing it clears the form. */
function LockRateForm() {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [description, setDescription] = useState("");
  const [accountCode, setAccountCode] = useState(ACCOUNTS[0].currency);
  const [until, setUntil] = useState(UNTIL_MONTHS[0]);
  const account = ACCOUNTS.find(({ currency }) => currency === accountCode) ?? ACCOUNTS[0];

  const value = Number(amount);
  const exceedsBalance = value > Number(account.balance);
  // Nothing locks a rate yet and every balance is a placeholder 0.00, so this stays false.
  const canLockRate = value > 0 && !exceedsBalance && recipient.trim() !== "";

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="flex items-baseline justify-center text-[30px] leading-none">
        <span className="mr-2 text-black/40 dark:text-white/50">{account.symbol}</span>
        <input
          autoFocus
          aria-label="Amount"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d*\.?\d{0,2}$/.test(next)) {
              setAmount(next);
            }
          }}
          style={{ width: `${Math.max(amount.length, 1)}ch` }}
          className="max-w-[80%] bg-transparent text-[#141414] outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/30"
        />
      </div>
      <p aria-live="polite" className="mt-2 h-5 text-center text-[13px] text-[#B4412F] dark:text-[#E98A7A]">
        {exceedsBalance ? "Exceeds your available balance" : ""}
      </p>

      <div className="mt-4">
        <label htmlFor="lock-rate-to" className={FIELD_LABEL}>
          To
        </label>
        <div className={FIELD_LINE}>
          <input
            id="lock-rate-to"
            placeholder="Email, phone, ID, or @handle"
            autoComplete="off"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            className={FIELD_INPUT}
          />
        </div>
      </div>

      <div className="mt-6">
        <span id="lock-rate-from" className={FIELD_LABEL}>
          From
        </span>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-labelledby="lock-rate-from lock-rate-from-value" className={cn(FIELD_LINE, "justify-between outline-none")}>
              <span id="lock-rate-from-value" className="text-[15px] text-[#141414] dark:text-white">
                {account.currency}
                <span className="ml-2 text-black/55 dark:text-white/60">
                  {account.symbol}
                  {account.balance} available
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-black/60 dark:text-white/60" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className={cn(MENU_CONTENT, "w-[var(--radix-dropdown-menu-trigger-width)]")}
            >
              {ACCOUNTS.map(({ currency, symbol, balance }) => (
                <DropdownMenu.Item
                  key={currency}
                  onSelect={() => setAccountCode(currency)}
                  className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
                >
                  {currency}
                  <span className="text-[14px] text-black/55 dark:text-white/60">
                    {symbol}
                    {balance} available
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-6">
        <span id="lock-rate-until" className={FIELD_LABEL}>
          Until
        </span>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-labelledby="lock-rate-until lock-rate-until-value"
              className={cn(FIELD_LINE, "justify-between outline-none")}
            >
              <span id="lock-rate-until-value" className="text-[15px] text-[#141414] dark:text-white">
                {until}
              </span>
              <ChevronDown className="h-4 w-4 text-black/60 dark:text-white/60" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className={cn(MENU_CONTENT, "w-[var(--radix-dropdown-menu-trigger-width)]")}
            >
              {UNTIL_MONTHS.map((month) => (
                <DropdownMenu.Item
                  key={month}
                  onSelect={() => setUntil(month)}
                  className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
                >
                  {month}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="mt-6">
        <label htmlFor="lock-rate-description" className={FIELD_LABEL}>
          Description
        </label>
        <div className={FIELD_LINE}>
          <input
            id="lock-rate-description"
            placeholder="What's this for?"
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={FIELD_INPUT}
          />
          <span className="ml-3 shrink-0 text-[14px] text-black/55 dark:text-white/60">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canLockRate}
        className="mt-8 h-12 w-full rounded-full bg-[#141414] text-[15px] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#EDE5DA] disabled:text-black/45 dark:bg-white dark:text-[#141414] dark:disabled:bg-white/10 dark:disabled:text-white/40"
      >
        Lock rate
      </button>
    </form>
  );
}

/** The dashboard's "Move money" button: its menu of actions and the Lock rate dialog. */
export function MoveMoney({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isLockRateOpen, setIsLockRateOpen] = useState(false);

  return (
    <>
      {/* Not modal: a modal menu handing focus to a dialog leaves the page unclickable after it closes. */}
      <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-[46px] shrink-0 items-center gap-2 rounded-full bg-[#141414] px-[22px] text-[15px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-[#141414] dark:hover:bg-white/90"
          >
            Move money
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={cn(MENU_CONTENT, "w-[240px]")}>
            <DropdownMenu.Item
              onSelect={() => setIsLockRateOpen(true)}
              className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
            >
              Lock rate
            </DropdownMenu.Item>
            {/* The sidebar that also links to Exchange is hidden on phones. */}
            <DropdownMenu.Item
              asChild
              className={cn(MENU_ITEM, "cursor-pointer data-[highlighted]:bg-black/5 dark:data-[highlighted]:bg-white/10")}
            >
              <Link href="/send">Exchange</Link>
            </DropdownMenu.Item>
            {SOON_ACTIONS.map((action) => (
              <DropdownMenu.Item key={action} disabled className={cn(MENU_ITEM, "text-black/45 dark:text-white/40")}>
                {action}
                <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[12px] text-black/60 dark:bg-white/10 dark:text-white/60">
                  Soon
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={isLockRateOpen} onOpenChange={setIsLockRateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 outline-none dark:bg-[#1A1A1A] sm:p-8"
          >
            <Dialog.Title className="text-center text-[16px] text-[#141414] dark:text-white">Lock rate</Dialog.Title>
            <LockRateForm />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
