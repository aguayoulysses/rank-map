import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { brandForHost } from "@/lib/brand";
import { BrandProvider } from "@/components/BrandContext";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const brand = brandForHost((await headers()).get("host"));
  return {
    title: `${brand.product} · ${brand.name}`,
    description: "See where you show up in Google Maps, street by street.",
    icons: { icon: brand.favicon },
    other: { "color-scheme": "only light" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand = brandForHost((await headers()).get("host"));
  const vars = {
    "--accent": brand.accent,
    "--accent-ink": brand.accentInk,
    "--accent-deep": brand.accentDeep,
    "--rail": brand.rail,
  } as React.CSSProperties;
  return (
    <html lang="en" style={vars}>
      <body className={`${manrope.variable} antialiased`}>
        <BrandProvider brand={brand}>{children}</BrandProvider>
      </body>
    </html>
  );
}
