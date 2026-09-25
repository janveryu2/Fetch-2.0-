import Link from "next/link";
import { FetchBrand } from "@/components/brand/fetch-brand";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return <div className="blue-grid min-h-[100dvh]"><header className="mx-auto flex h-[78px] max-w-[1380px] items-center justify-between px-5 lg:px-10"><FetchBrand /><Link href="/app" className="font-extrabold text-[var(--fetch-blue-700)]">Back to login</Link></header><main className="flex min-h-[calc(100dvh-78px)] items-center justify-center px-4 py-10"><ForgotPasswordForm authConfigured={authConfigured} /></main></div>;
}
