import Image from "next/image";

/**
 * The fiat currency's flag, badged with the token that holds it on chain. The badge sits in a
 * notch cut out of the flag, so whatever is behind the icon shows round it on any background.
 */
export function CurrencyIcon({ account, size }: { account: { flagSrc: string; iconSrc: string }; size: number }) {
  const badge = Math.round(size * 0.47); // 15px on the 32px pill flag
  const overhang = Math.max(2, Math.round(size * 0.09)); // past the flag's bottom-right edge
  const gap = size >= 28 ? 2 : 1.5; // the sliver of background round the badge
  const center = size + overhang - badge / 2;
  const hole = badge / 2 + gap;
  const notch = `radial-gradient(circle at ${center}px ${center}px, transparent ${hole}px, #000 ${hole + 0.5}px)`;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="relative h-full w-full" style={{ maskImage: notch, WebkitMaskImage: notch }}>
        <Image src={account.flagSrc} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover object-center" />
        {/* A hairline so the flag's white keeps an edge against a white pill. */}
        <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
      </span>
      <Image
        src={account.iconSrc}
        alt=""
        width={badge}
        height={badge}
        className="absolute rounded-full object-cover"
        style={{ width: badge, height: badge, right: -overhang, bottom: -overhang }}
      />
    </span>
  );
}
