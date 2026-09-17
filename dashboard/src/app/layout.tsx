import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['400','500','600'] });
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400','500'] });

// in your <body> tag:
// <body className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// // const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Real-Time Personalization Engine",
  description: "Live UCB1 bandit recommendation and offline telemetry replay engine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
