import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英语生活剧场 · 半年沉浸进阶",
  description: "通过大量情境对话、整句理解、连续听、跟读与角色接话，26 周从日常交流走向连贯深入表达。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
