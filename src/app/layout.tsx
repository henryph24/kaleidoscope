import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-feed",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kaleidoscope · 4D Occupancy Engine",
  description:
    "Vision-only spatial reasoning. Reconstruct 2D video into a 3D vector space and predict agent intent. No LiDAR.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
