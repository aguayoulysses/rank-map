# Rank Map

A Google Maps rank heatmap. You pick a business and a keyword, the app drops a grid of pins around the business, checks who shows up on Google Maps for that search at every pin, and colors each pin by where the business ranked. Green = top 3, amber = 4 to 10, red = 11 to 20 or not found.

It ships unbranded. Every key, password and logo is yours to plug in. Nothing in this code talks to anyone else's accounts.

**What you get**
- Rank heatmaps for any business on Google Maps (circle or square grids, 7 to 200 pins)
- Up to 5 keywords per scan, pins fill in live
- A top-20 list at every pin, so you can see exactly who beats you where
- Market research mode: scan a keyword over a city with no client, get a 0 to 100 difficulty score
- Scan history, compare to the last scan, CSV export
- Public read-only share links for clients (no login needed)
- White-label: your name, logo and colors, one app can serve several brands on different domains
- Optional "Sign in with Google" to import every Business Profile a Google account manages
- No monthly software fee. You only pay DataForSEO per pin, about $0.002 each

---

## Part 1. Get it running (about 30 minutes)

You need a computer with **Node.js 20 or newer** (download from nodejs.org).

### Step 1. Create the accounts

| Account | What it's for | Cost |
|---|---|---|
| **DataForSEO** (dataforseo.com) | Pulls the Google Maps results | Pay as you go. A $50 deposit covers about 25,000 pins |
| **Turso** (turso.tech) | Database that stores businesses and scans | Free tier is plenty |
| **Vercel** (vercel.com) | Puts the app online | Free to start, Pro ($20/mo) recommended so long scans don't time out |
| **GitHub** (github.com) | Holds the code so Vercel can deploy it | Free |

**DataForSEO:** sign up, add funds, then open **API Dashboard → API Access**. You'll see an **API login** (your email) and an **API password**. The API password is NOT your website password. Copy both.

**Turso:** install the Turso command line tool (instructions on turso.tech), then:

```
turso auth login
turso db create rankmap
turso db show rankmap --url        # copy this, it starts with libsql://
turso db tokens create rankmap     # copy this token
```

The app creates its own tables the first time it runs. You don't set up anything inside the database.

### Step 2. Fill in your settings

In the project folder:

```
npm install
cp .env.example .env.local
```

Open `.env.local` and fill it in:

| Setting | What to put |
|---|---|
| `DATAFORSEO_LOGIN` | DataForSEO API login |
| `DATAFORSEO_PASSWORD` | DataForSEO API password |
| `TURSO_DATABASE_URL` | the `libsql://` URL from Turso |
| `TURSO_AUTH_TOKEN` | the token from Turso |
| `APP_PASSWORD` | the password your team types to get in |
| `SESSION_SECRET` | any long random string. Run `openssl rand -hex 32` to make one |
| `GEOCODE_USER_AGENT` | optional, e.g. `RankMap/1.0 (you@yourcompany.com)` |
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | optional, see Part 4. Leave blank to skip |

Just want to try it on your computer without Turso? Use `TURSO_DATABASE_URL=file:local.db` and leave the token blank.

### Step 3. Run it

```
npm run dev
```

Open http://localhost:3023, type your `APP_PASSWORD`, and you're in. The DataForSEO balance shows in the header, so you'll know right away if the keys work.

---

## Part 2. Make it yours (branding)

Everything brand-related is in one file: `lib/brand.ts`.

1. Put your logo files in `public/brands/<your-name>/`. You need three:
   - `mark` — square icon, used in the header (512×512 PNG or SVG)
   - `logo` — full logo, used on the sign-in screen
   - `favicon` — browser tab icon (64×64)
2. Edit the brand entry in `lib/brand.ts`:

```ts
{
  id: "acme",
  name: "Acme Marketing",          // your company, shows as "by Acme Marketing"
  product: "Rank Map",             // what the tool is called
  mark: "/brands/acme/mark.png",
  logo: "/brands/acme/logo.png",
  favicon: "/brands/acme/favicon.png",
  accent: "#2563eb",               // main button color
  accentInk: "#ffffff",            // text color on top of the button
  accentDeep: "#1d4ed8",           // darker version of accent, for hover
  rail: "#121316",                 // header bar color
  website: "https://acme.com",     // shared reports link back here (optional)
  hosts: ["rank.acme.com", "localhost"],  // which domains show this brand
}
```

**Running several brands from one app** (for example, reselling to other agencies): add one entry per brand, each with its own `hosts`. When someone visits `rank.agency-two.com`, they see Agency Two's logo and colors. Any unknown domain falls back to the first brand in the list. Note that all brands share the same database, password and scans.

---

## Part 3. Put it online (Vercel)

1. Push the project to a private GitHub repo.
2. In Vercel: **Add New → Project**, import that repo. Vercel detects Next.js on its own.
3. Before deploying, open **Environment Variables** and add every setting from your `.env.local`.
4. Deploy. You get a `.vercel.app` link.
5. Custom domain: **Project → Settings → Domains**, add `rank.yourcompany.com`, then add the DNS record Vercel shows you at your domain provider. Add that domain to `hosts` in `lib/brand.ts` too.

Big scans take a few minutes. The scan route allows up to 5 minutes (`maxDuration = 300` in `app/api/scans/route.ts`). The Vercel Hobby plan may cut long scans short; Pro handles them.

---

## Part 4. Optional: Sign in with Google

This lets you sign in with Google from the **Settings** page and import every Business Profile that Google account manages, instead of typing businesses in by hand.

1. In Google Cloud Console, create a project.
2. Request access to the **Google Business Profile APIs** (Google reviews these requests, it can take days). Once approved, enable **My Business Account Management API** and **My Business Business Information API**.
3. **APIs & Services → OAuth consent screen**: set it up, add the scope `https://www.googleapis.com/auth/business.manage`. While it's in "Testing", add your Google accounts as test users. Testing-mode logins expire after 7 days, so publish the app when you're ready.
4. **Credentials → Create OAuth client ID → Web application**. Add these redirect URIs:
   - `http://localhost:3023/api/google/callback`
   - `https://rank.yourcompany.com/api/google/callback` (your real domain)
5. Put the client ID and secret into `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

Service-area businesses (the ones that hide their address) come in without a location. The app places them on Google's map dot and asks you to drag the pin to where they actually work from.

---

## Part 5. How it works

### A scan, step by step

1. **Add a business.** Type its name and city. One DataForSEO search finds it on Google Maps and saves its location plus its Place ID and CID (Google's IDs for that listing).
2. **Set up the scan.** Keyword, shape, rings (1 to 7), spacing (drive-time preset or custom miles), map zoom. The grid shows on the map before you spend anything. Pins in water can be skipped.
3. **Run scan.** For every pin, the server asks DataForSEO for the Google Maps top 20 as if someone searched from that exact spot.
4. **Find the business** in each top 20. It matches by CID or Place ID first, name only as a fallback. Sponsored map ads are removed, they aren't rankings.
5. **Pins stream in live** and are saved as they land, so closing the tab doesn't lose a scan.
6. **Report:** average rank (not found counts as 21), % of pins in the top 3, and the full top 20 at each pin. Competitor views reuse that stored data, so they cost nothing extra.

Nothing runs on a schedule. Every scan is someone pressing the button, so there are no surprise bills.

### Pins and cost

| Rings | Circle pins | Square pins | Circle cost |
|---|---|---|---|
| 1 | 7 | 9 | ~$0.01 |
| 3 | 39 | 49 | ~$0.08 |
| 5 | 95 | 121 | ~$0.19 |
| 7 | 175 | 225 (over the cap) | ~$0.35 |

Circle = 3L² + 4L pins, square = (2L+1)² pins. Max 200 pins and 5 keywords per run. Each keyword is its own scan, so 3 keywords = 3× the cost.

### Zoom

Each search includes a map zoom. **13z is the default and the one to use.** At 14z and up, Google shows a smaller area, so ranks drop off sharply at the edges in a way real searchers don't see.

### Service-area businesses

If a business hides its address, center the grid on where they actually work from (drag the home pin or paste coordinates), not on Google's dot.

### Market research mode

Same scan, no business. Pick a keyword and a city to judge how hard a market is before taking a client. Each pin gets a 0 to 100 difficulty score (easy under 30, moderate under 55, hard under 78), based on the top 3 businesses at that spot:
- **Relevance**: are they really that kind of business? A restaurant ranking for "catering" is easier to beat than a real caterer.
- **Distance**: how far they are from the pin.
- **Reviews and rating.**

You also get reviews needed to reach the top 3, weak spots (top-3 holders with under 10 reviews), and you can click any competitor to see the map from their side.

If a trade's searches come out oddly easy, add its words to the `SYNONYMS` list in `lib/insights.ts` (for example, "drain cleaning" → plumber).

---

## Part 6. The DataForSEO call

All paid calls are in `lib/dataforseo.ts`. The one that powers the heatmap:

```
POST https://api.dataforseo.com/v3/serp/google/maps/live/advanced
Authorization: Basic base64(login:password)

[{ "keyword": "plumber", "location_coordinate": "30.267200,-97.743100,13z", "depth": 20, "language_code": "en" }]
```

- `location_coordinate` = the pin's latitude, longitude and zoom. Same search, different spot: that's the whole heatmap.
- `depth: 20` = top 20 businesses.
- Results are in `tasks[0].result[0].items`. Each has `rank_group` (position), `title`, `cid`, `place_id`, `rating`, `category`, `latitude`, `longitude`. Items with `type: "maps_paid_item"` are ads and get dropped.
- `status_code 20000` = ok. `40102` = nothing found at that spot (counted as not ranked).
- Each pin retries up to 4 times. 10 pins run at once.
- `GET /v3/appendix/user_data` returns your balance, shown in the header.

---

## Code map

| File | What it does |
|---|---|
| `lib/dataforseo.ts` | Every paid API call |
| `lib/grid.ts` | Pin layouts, drive-time presets, cost per pin |
| `app/api/scans/route.ts` | Runs a scan, streams pins back |
| `lib/db.ts` | Database tables, avg rank and top-3 math |
| `lib/insights.ts` | Competitors, market difficulty, weak spots |
| `components/MapView.tsx`, `lib/mapStyle.ts` | The map (MapLibre + free OpenFreeMap tiles, no map key) |
| `app/api/geocode/route.ts` | City search for market research (free OpenStreetMap search, US + Canada) |
| `lib/brand.ts` | Branding |
| `lib/google.ts`, `app/api/google/*` | Optional Google Business Profile import |
| `lib/auth.ts`, `middleware.ts` | Shared password + signed login cookie |
| `app/share/[token]` | Public client report links |

Built with Next.js 15, React 19, Tailwind 4, MapLibre 5, Turso (libSQL).

## Troubleshooting

- **"DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set"**: settings missing, or you edited `.env.local` without restarting `npm run dev`. On Vercel, redeploy after adding settings.
- **"DataForSEO HTTP 401"**: you used the website password instead of the API password.
- **Business not found when adding**: add the city after the name ("Joe's Plumbing Denver").
- **Business shows "not found" on every pin**: check you picked the right listing. Matching uses Google's IDs, so a duplicate listing won't match.
- **Scan stops partway on Vercel**: the plan's function time limit. Use fewer pins or Vercel Pro.
- **Keep `maplibre-gl` on version 5.** Version 6 breaks the Next.js build.
- **Google sign-in stops working after a week**: your OAuth consent screen is still in Testing. Publish it and reconnect.
