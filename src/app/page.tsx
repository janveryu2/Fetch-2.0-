import { Pricing } from "@/components/landing/pricing";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  FilePdf,
  Lightning,
  TrendUp,
} from "@phosphor-icons/react/dist/ssr";
import { FetchBrand } from "@/components/brand/fetch-brand";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Bring your own material",
    text: "Paste your notes today. PDF and link import are planned.",
    icon: FilePdf,
  },
  {
    title: "Practice active recall",
    text: "Mix multiple-choice and written answers inside one focused session.",
    icon: Lightning,
  },
  {
    title: "Understand every grade",
    text: "Review correct and incorrect answers with explanations from your practice pack.",
    icon: CheckCircle,
  },
  {
    title: "Build lasting progress",
    text: "Return to difficult questions, review attempts, and keep a steady study rhythm.",
    icon: TrendUp,
  },
];

export default function LandingPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[color:var(--surface-card)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[74px] max-w-[1380px] items-center justify-between px-5 lg:px-10">
          <FetchBrand />
          <nav
            aria-label="Primary"
            className="hidden items-center gap-8 font-bold text-[var(--text-secondary)] md:flex"
          >
            <a href="#features" className="hover:text-[var(--fetch-blue-700)]">
              Features
            </a>
            <a href="#how" className="hover:text-[var(--fetch-blue-700)]">
              How it works
            </a>
            <a href="#pricing" className="hover:text-[var(--fetch-blue-700)]">
              Pricing
            </a>
          </nav>
          <Button asChild size="sm">
            <Link href="/app">Launch App</Link>
          </Button>
        </div>
      </header>

      <main id="main">
        <section className="blue-grid overflow-hidden border-b border-[var(--border-subtle)]">
          <div className="mx-auto grid min-h-[calc(100dvh-74px)] max-w-[1380px] items-center gap-8 px-5 py-12 md:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-16">
            <div className="max-w-[680px]">
              <p className="mb-5 inline-flex rounded-full border border-[var(--fetch-blue-200)] bg-[var(--surface-card)] px-4 py-2 text-sm font-extrabold text-[var(--fetch-blue-800)]">
                Meet FETCH, your study buddy
              </p>
              <h1 className="font-display text-balance text-[clamp(2.8rem,6vw,5.2rem)] font-semibold leading-[.96] tracking-[-.035em]">
                Turn any module into a quiz you&apos;ll{" "}
                <span className="text-[var(--fetch-blue-600)]">enjoy</span>
              </h1>
              <p className="mt-6 max-w-[58ch] text-lg leading-8 text-[var(--text-secondary)] md:text-xl">
                Turn pasted notes into focused practice with instant feedback.
                Try the clearly labeled local demo.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/app">
                    Get Started Free <ArrowRight weight="bold" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#how">See How It Works</a>
                </Button>
              </div>
              <dl className="mt-10 grid max-w-[620px] grid-cols-3 gap-4 border-t border-[var(--border-strong)] pt-6">
                <div>
                  <dt className="font-display text-2xl font-semibold">
                    Focused
                  </dt>
                  <dd className="text-sm text-[var(--text-secondary)]">
                    source-based cards
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-2xl font-semibold">
                    Instant
                  </dt>
                  <dd className="text-sm text-[var(--text-secondary)]">
                    friendly grading
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-2xl font-semibold">Saved</dt>
                  <dd className="text-sm text-[var(--text-secondary)]">
                    study history
                  </dd>
                </div>
              </dl>
            </div>
            <div className="relative mx-auto w-full max-w-[570px] self-end md:self-center">
              <div className="absolute inset-x-[8%] bottom-[4%] h-[18%] rounded-[50%] bg-[var(--fetch-blue-200)]/60 blur-3xl" />
              <Image
                src="/assets/mascot/fetch-seated.png"
                alt="FETCH, a cheerful pixel-art study buddy wearing a blue cap"
                width={720}
                height={720}
                priority
                className="pixel-art relative z-10 h-auto w-full drop-shadow-[0_28px_24px_rgba(8,47,115,.14)]"
              />
            </div>
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-[1240px] px-5 py-24 lg:px-10 lg:py-32"
        >
          <div className="max-w-3xl">
            <h2 className="font-display text-balance text-4xl font-semibold tracking-[-.025em] md:text-6xl">
              Everything you need to study smarter
            </h2>
            <p className="mt-5 max-w-[62ch] text-lg text-[var(--text-secondary)]">
              FETCH works with your actual material, then turns practice into a
              clear loop you can return to.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-[1.15fr_.85fr]">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className={`rounded-2xl border border-[var(--border-subtle)] p-7 ${index === 0 ? "bg-[var(--action-bg)] text-[var(--action-text)] md:row-span-2 md:p-10" : "bg-[var(--surface-card)]"}`}
                >
                  <Icon
                    size={index === 0 ? 42 : 30}
                    weight="duotone"
                    className={
                      index === 0
                        ? "text-[var(--fetch-blue-100)]"
                        : "text-[var(--fetch-blue-600)]"
                    }
                  />
                  <h3 className="font-display mt-8 text-2xl font-semibold">
                    {feature.title}
                  </h3>
                  <p
                    className={`mt-3 max-w-[44ch] ${index === 0 ? "text-white/95" : "text-[var(--text-secondary)]"}`}
                  >
                    {feature.text}
                  </p>
                  {index === 0 && (
                    <Image
                      src="/assets/mascot/fetch-active.png"
                      alt="FETCH ready for an active study session"
                      width={360}
                      height={360}
                      className="pixel-art mx-auto mt-8 w-[70%]"
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section id="how" className="bg-[var(--surface-subtle)] py-24 lg:py-32">
          <div className="mx-auto max-w-[1160px] px-5 lg:px-10">
            <h2 className="font-display text-center text-4xl font-semibold tracking-[-.025em] md:text-6xl">
              From material to mastery
            </h2>
            <div className="mt-14 grid gap-10 md:grid-cols-3">
              {[
                "Add your material",
                "Answer focused questions",
                "Review and improve",
              ].map((title, index) => (
                <div
                  key={title}
                  className="border-t-2 border-[var(--fetch-blue-300)] pt-6"
                >
                  <span className="font-display text-4xl font-semibold text-[var(--fetch-blue-600)]">
                    {index + 1}
                  </span>
                  <h3 className="font-display mt-5 text-2xl font-semibold">
                    {title}
                  </h3>
                  <p className="mt-3 text-[var(--text-secondary)]">
                    {
                      [
                        "Paste a section of notes to create a practice pack.",
                        "Practice written recall and multiple-choice questions together.",
                        "See every grade, revisit misses, and track what is sticking.",
                      ][index]
                    }
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Pricing />
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="mx-auto flex max-w-[1380px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <FetchBrand />
          <p className="text-sm text-[var(--text-secondary)]">
            Built for focused, source-grounded study.
          </p>
        </div>
      </footer>
    </>
  );
}
