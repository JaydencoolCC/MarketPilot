import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Desk",
  description: "个人 AI 金融信息工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
