import Link from "next/link";
import { FetchBrand } from "@/components/brand/fetch-brand";
import { LoginCard } from "@/components/auth/login-card";

export default function AppEntryPage() {
  const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return (
    <div className="blue-grid min-h-[100dvh]">
      <a href="#login" className="skip-link">Skip to login</a>
      <header className="mx-auto flex h-[78px] max-w-[1380px] items-center justify-between px-5 lg:px-10">
        <FetchBrand />
        <Link href="/" className="font-extrabold text-[var(--fetch-blue-700)]">Back to website</Link>
      </header>
      <main id="login" className="flex min-h-[calc(100dvh-78px)] items-center justify-center px-4 py-10">
        <LoginCard authConfigured={authConfigured} />
      </main>
    </div>
  );
}
