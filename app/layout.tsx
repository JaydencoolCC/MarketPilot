import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketPilot",
  description: "Personal AI finance workspace",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieLocale = (await cookies()).get("marketpilot-locale")?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : "zh";

  return (
    <html lang={locale === "en" ? "en" : "zh-CN"}>
      <body>{children}</body>
    </html>
  );
}
