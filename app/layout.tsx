import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "樱雪的干饭小问卷 · 和你一起好好吃饭",
  description: "六家心动餐厅，下一顿的快乐，由你来选。来自 Adam 的小小邀请。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/dinner.svg",
    shortcut: "/dinner.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
