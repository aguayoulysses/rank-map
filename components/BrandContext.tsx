"use client";

import { createContext, useContext } from "react";
import { BRANDS, type Brand } from "@/lib/brand";

const Ctx = createContext<Brand>(BRANDS[0]);

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <Ctx.Provider value={brand}>{children}</Ctx.Provider>;
}

export const useBrand = () => useContext(Ctx);
