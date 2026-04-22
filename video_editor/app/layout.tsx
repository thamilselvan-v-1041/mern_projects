import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Editor",
  description: "Browser-based video editor with timeline and AI-assisted media.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
