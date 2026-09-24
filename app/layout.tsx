import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Atelier's two faces (G-045): Archivo carries the interface, and IBM Plex Mono every number the reader compares --
// stitch counts, dimensions, percentages -- so digits line up in a column instead of drifting.
// Archivo is a variable font, so it takes no `weight`; IBM Plex Mono is not, so it must name the ones used.
const atelierSans = Archivo({
  variable: "--font-atelier-sans",
  subsets: ["latin"],
});

const atelierMono = IBM_Plex_Mono({
  variable: "--font-atelier-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Cross-Stitch Pattern Generator",
  description: "Turn a photo into a printable cross-stitch chart, entirely in your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atelierSans.variable} ${atelierMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
