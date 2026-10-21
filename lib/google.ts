import { db, ensureSchema } from "./db";

// "Sign in with Google" for Business Profiles. Uses the approved GBP API
// project; every connected Google account keeps its own refresh token here.

const SCOPES = ["https://www.googleapis.com/auth/business.manage", "openid", "email"];

function client() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set");
  return { id, secret };
}

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: client().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = client();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description ?? d.error ?? "Google sign-in failed");
  let email: string | null = null;
  if (d.id_token) {
    try {
      email = JSON.parse(Buffer.from(String(d.id_token).split(".")[1], "base64url").toString()).email ?? null;
    } catch {
      /* no email claim */
    }
  }
  return { refreshToken: d.refresh_token as string | undefined, accessToken: d.access_token as string, email };
}

async function accessToken(refreshToken: string) {
  const { id, secret } = client();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error === "invalid_grant" ? "Google access expired. Connect this account again." : d.error_description ?? "Google token error");
  return d.access_token as string;
}

export interface GoogleConn {
  id: number;
  email: string;
  createdAt: string;
}

export async function listConnections(): Promise<GoogleConn[]> {
  await ensureSchema();
  const r = await db().execute("SELECT id, email, created_at FROM hx_google ORDER BY created_at");
  return r.rows.map((x) => ({ id: Number(x.id), email: String(x.email), createdAt: String(x.created_at) }));
}

export async function saveConnection(email: string, refreshToken: string) {
  await ensureSchema();
  await db().execute({
    sql: "INSERT INTO hx_google (email, refresh_token) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET refresh_token = excluded.refresh_token",
    args: [email, refreshToken],
  });
}

export async function removeConnection(id: number) {
  await ensureSchema();
  await db().execute({ sql: "DELETE FROM hx_google WHERE id = ?", args: [id] });
}

async function tokenFor(connId: number) {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT refresh_token FROM hx_google WHERE id = ?", args: [connId] });
  if (!r.rows[0]) throw new Error("That Google account isn't connected");
  return accessToken(String(r.rows[0].refresh_token));
}

export interface GbpLocation {
  name: string; // locations/123
  account: string; // accounts/456
  accountName: string;
  title: string;
  category: string | null;
  placeId: string | null;
  cid: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  serviceAreaBusiness: boolean;
  serviceCities: string[];
}

interface RawLoc {
  name: string;
  title: string;
  categories?: { primaryCategory?: { displayName?: string } };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
  latlng?: { latitude?: number; longitude?: number };
  metadata?: { placeId?: string; mapsUri?: string };
  serviceArea?: { businessType?: string; places?: { placeInfos?: { placeName?: string }[] } };
}

/** Every Business Profile the Google account can manage, across all its accounts and location groups. */
export async function listLocations(connId: number): Promise<GbpLocation[]> {
  const token = await tokenFor(connId);
  const h = { Authorization: `Bearer ${token}` };
  const accounts: { name: string; accountName?: string }[] = [];
  let pageToken = "";
  do {
    const r = await fetch(`https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: h });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message ?? "Couldn't read Google accounts");
    accounts.push(...(d.accounts ?? []));
    pageToken = d.nextPageToken ?? "";
  } while (pageToken);

  const out: GbpLocation[] = [];
  const mask = "name,title,categories,storefrontAddress,latlng,metadata,serviceArea";
  for (const a of accounts) {
    let pt = "";
    do {
      const r = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?pageSize=100&readMask=${mask}${pt ? `&pageToken=${pt}` : ""}`, { headers: h });
      const d = await r.json();
      if (!r.ok) break; // an account we can see but not read; skip it
      for (const l of (d.locations ?? []) as RawLoc[]) {
        const sa = l.storefrontAddress;
        const addr = sa?.addressLines?.length ? [sa.addressLines.join(", "), sa.locality, [sa.administrativeArea, sa.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
        const cid = l.metadata?.mapsUri?.match(/cid=(\d+)/)?.[1] ?? null;
        out.push({
          name: l.name,
          account: a.name,
          accountName: a.accountName ?? a.name,
          title: l.title,
          category: l.categories?.primaryCategory?.displayName ?? null,
          placeId: l.metadata?.placeId ?? null,
          cid,
          address: addr,
          lat: l.latlng?.latitude ?? null,
          lng: l.latlng?.longitude ?? null,
          serviceAreaBusiness: l.serviceArea?.businessType === "CUSTOMER_LOCATION_ONLY",
          serviceCities: (l.serviceArea?.places?.placeInfos ?? []).map((p) => (p.placeName ?? "").replace(/, USA$/, "")).filter(Boolean),
        });
      }
      pt = d.nextPageToken ?? "";
    } while (pt);
  }
  // de-dupe locations shared across a personal account and a location group
  const seen = new Set<string>();
  return out.filter((l) => {
    const k = l.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
