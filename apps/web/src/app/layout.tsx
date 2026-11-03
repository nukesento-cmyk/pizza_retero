import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Shrikhand, Work_Sans } from "next/font/google";
import "./globals.css";

const shrikhand = Shrikhand({ weight: "400", subsets: ["latin"], variable: "--font-shrikhand", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"], variable: "--font-fraunces", display: "swap",
  axes: ["SOFT", "WONK", "opsz"], style: ["normal", "italic"],
});
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Retero Pizza Co.", template: "%s · Retero Pizza Co." },
  description: "Hand-stretched, fire-kissed pizza from a parlour that never left the seventies.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6ecd9" },
    { media: "(prefers-color-scheme: dark)", color: "#15100c" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${shrikhand.variable} ${fraunces.variable} ${workSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
