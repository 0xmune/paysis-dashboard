import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paysis Dashboard",
  description: "Segment Analytics Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
