import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";

export const metadata: Metadata = {
  title: "Meatplus HRIS",
  description: "Internal HR / Payroll / Attendance system for Meatplus PH",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`}</Script>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
