// White-label config. Each brand owns one or more hostnames; anything unknown
// falls back to the first brand. To white-label for an agency: drop their logo
// files in public/brands/<id>/, add an entry here, and point their domain at
// this Vercel project.

export interface Brand {
  id: string;
  /** company name shown in the header and on shared reports */
  name: string;
  /** what this tool is called inside the brand */
  product: string;
  /** square mark for the header and favicon */
  mark: string;
  /** full logo for the sign-in screen and shared reports */
  logo: string;
  favicon: string;
  /** primary button + focus + "you are here" color, and the text color that sits on it */
  accent: string;
  accentInk: string;
  accentDeep: string;
  /** header bar */
  rail: string;
  website?: string;
  hosts: string[];
}

export const BRANDS: Brand[] = [
  {
    // The default brand. Change these values to make the app yours.
    id: "default",
    name: "Your Agency",
    product: "Rank Map",
    mark: "/brands/default/mark.svg",
    logo: "/brands/default/logo.svg",
    favicon: "/brands/default/favicon.svg",
    accent: "#2563eb",
    accentInk: "#ffffff",
    accentDeep: "#1d4ed8",
    rail: "#121316",
    website: undefined,
    hosts: ["localhost"],
  },
];

export function brandForHost(host: string | null | undefined): Brand {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return BRANDS.find((b) => b.hosts.includes(h)) ?? BRANDS[0];
}
