# Dobby Framer Reverse Proxy

This Cloudflare Worker reverse-proxies requests to the current Framer site:

```txt
https://dobbybookkeeping.framer.website
```

It preserves the visitor-facing URL, forwards the same path and query string to Framer, and rewrites same-origin Framer redirects back to your proxied domain.

## Local Setup

```bash
cd proxy-worker
npm install
npm run check
npm run dev
```

Open the local Wrangler URL and test a few routes from the Framer site.

## Deploy

```bash
cd proxy-worker
npx wrangler login
npm run deploy
```

## Connect Your Domain

1. In Cloudflare, add the domain you want visitors to use.
2. Point the domain's nameservers to Cloudflare if you have not already.
3. Create proxied DNS records:
   - apex/root domain: `A` record to `192.0.2.1`, proxy enabled, or your actual hosting target if you already have one
   - `www`: `CNAME` to the apex/root domain, proxy enabled
4. Edit `proxy-worker/wrangler.jsonc` and replace the example route comments with your real domain:

```jsonc
"routes": [
  { "pattern": "yourdomain.com/*", "zone_name": "yourdomain.com" },
  { "pattern": "www.yourdomain.com/*", "zone_name": "yourdomain.com" }
]
```

5. Run `npm run deploy` again from `proxy-worker`.

## Change The Framer Source Later

Edit `FRAMER_ORIGIN` in `wrangler.jsonc`:

```jsonc
"vars": {
  "FRAMER_ORIGIN": "https://your-new-framer-site.framer.website"
}
```

Then redeploy.
