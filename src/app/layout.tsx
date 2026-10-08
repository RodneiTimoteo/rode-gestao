import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "RODE Gestão", template: "%s | RODE Gestão" },
  description: "Painel administrativo da RODE — Soluções Inteligentes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const themeScript = `(() => { try { const saved = localStorage.getItem('rode-theme'); const preference = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'; const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; } })();`;
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-full"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
