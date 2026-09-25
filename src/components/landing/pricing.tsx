import Image from "next/image";
import Link from "next/link";
import { Check, Clock, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

interface PricingFeature {
  text: string;
  availability: "demo" | "coming_soon" | "planned" | "account";
  badge: string;
}

const freeFeatures: PricingFeature[] = [
  { text: "Pasted text StudyPacks", availability: "demo", badge: "Available in demo" },
  { text: "3–12 questions per generation", availability: "demo", badge: "Available in demo" },
  { text: "Active recall quiz practice", availability: "demo", badge: "Available in demo" },
  { text: "Save StudyPacks locally", availability: "demo", badge: "Available in demo" },
  { text: "Local study streak & history", availability: "demo", badge: "Available in demo" },
  { text: "PDF & URL study material import", availability: "coming_soon", badge: "Coming soon" },
  { text: "10 AI-generated packs / month", availability: "planned", badge: "Planned quota" },
];

const proFeatures: PricingFeature[] = [
  { text: "Everything in Free", availability: "planned", badge: "Planned" },
  { text: "Smart review recommendations", availability: "planned", badge: "Planned" },
  { text: "Advanced progress analytics", availability: "planned", badge: "Planned" },
  { text: "Custom practice test builder", availability: "planned", badge: "Planned" },
  { text: "Expanded AI question generation", availability: "planned", badge: "Planned" },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-[1040px] px-5 py-20">
      <div className="mb-10 text-center">
        <h2 className="font-display text-4xl font-semibold">
          A little support. A lot of possibility.
        </h2>
        <p className="mt-3 text-[var(--text-secondary)]">
          Start learning for free. Real features are marked clearly so you know what works today.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <article className="surface-card flex flex-col p-7">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-semibold">FETCH Free</h3>
            <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">
              Core tier
            </span>
          </div>
          <p className="mt-5 font-display text-5xl font-semibold">₱0</p>
          <p className="mt-2 text-[var(--text-secondary)]">Free forever</p>
          <p className="notice mt-5 text-sm">
            Core study features are fully accessible today in browser demo mode.
          </p>
          <ul className="my-6 space-y-3">
            {freeFeatures.map(({ text, availability, badge }) => (
              <li key={text} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5">
                  {availability === "demo" ? (
                    <Check
                      size={18}
                      weight="bold"
                      className="shrink-0 text-[var(--fetch-blue-700)]"
                    />
                  ) : (
                    <Clock
                      size={18}
                      className="shrink-0 text-[var(--text-tertiary)]"
                    />
                  )}
                  <span>{text}</span>
                </span>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    availability === "demo"
                      ? "bg-[var(--surface-subtle)] text-[var(--fetch-blue-800)]"
                      : "bg-[var(--surface-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {badge}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-auto">
            <Link href="/app">Get started free</Link>
          </Button>
        </article>

        <article className="flex flex-col rounded-2xl border-2 border-[var(--fetch-blue-600)] bg-[var(--surface-subtle)] p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-semibold">
              FETCH Pro Max
            </h3>
            <span className="rounded-full bg-[var(--surface-card)] px-3 py-1 text-xs font-extrabold text-[var(--fetch-blue-800)]">
              Coming soon
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="mt-5 font-display text-5xl font-semibold">₱49</p>
              <p className="mt-2 text-[var(--text-secondary)]">
                Proposed one-time payment · Purchases unavailable
              </p>
            </div>
            <Image
              src="/assets/mascot/fetch-celebrate.png"
              alt=""
              width={96}
              height={96}
              className="pixel-art"
            />
          </div>
          <ul className="my-6 space-y-3">
            {proFeatures.map(({ text, badge }) => (
              <li key={text} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <Sparkle
                    size={18}
                    className="shrink-0 text-[var(--fetch-blue-600)]"
                  />
                  <span>{text}</span>
                </span>
                <span className="shrink-0 rounded-md bg-[var(--surface-card)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-tertiary)]">
                  {badge}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-auto rounded-xl bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
            A preview of planned features. Payment processing and Pro plan limits are not active. No purchases can be made.
          </p>
        </article>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        The current demo supports pasted text, 3–12 fixture questions, saved reviews, and local study history. Plan limits and future features are not active.
      </p>
    </section>
  );
}
