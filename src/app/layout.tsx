import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./workspace-refresh.css";

const nunito = localFont({
  src: "../../public/fonts/Nunito-variable.ttf",
  weight: "200 1000",
  variable: "--font-nunito",
  display: "swap",
});

const fredoka = localFont({
  src: "../../public/fonts/Fredoka-variable.ttf",
  weight: "300 700",
  variable: "--font-fredoka",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FETCH - Turn study material into practice",
    template: "%s | FETCH",
  },
  description:
    "Turn study notes into focused practice, plan your study time, and track your local learning history.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/assets/mascot/fetch-logo.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const t = localStorage.getItem("fetch-theme"); document.documentElement.dataset.theme = t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch {}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
