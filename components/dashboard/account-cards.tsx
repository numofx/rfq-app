import Image from "next/image";

const ACCOUNTS = [
  { iconSrc: "/tokens/usdc.svg", currency: "USDC", balance: "$0.00" },
  { iconSrc: "/tokens/cngn.png", currency: "cNGN", balance: "₦0.00" },
];

export function AccountCards() {
  return (
    <section>
      <h2 className="text-[16px] text-[#141414] dark:text-white">Accounts</h2>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {ACCOUNTS.map(({ iconSrc, currency, balance }) => (
          <div key={currency} className="flex items-center gap-4">
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-[#F5F5F3] dark:bg-white/5">
              <Image src={iconSrc} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
            </div>
            <div>
              <p className="text-[15px] text-[#141414] dark:text-white">{currency}</p>
              <p className="mt-1 text-[14px] text-[#6F6F6B] dark:text-white/60">{balance}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
