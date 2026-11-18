# ADR-0005: MERN stack

- Status: Accepted (team decision)
- Supersedes: Architecture v1.0 choices of NestJS (API) and Next.js (web).
- Decision: MongoDB (ADR-0003), Express API in JavaScript on Node 22, React single-page app in
  TypeScript built with Vite. Shared packages (`packages/contracts`, `packages/ui`) are TypeScript.
- Consequences:
  - **No server-side rendering.** The app sits behind login and does not need SEO. Public marketing
    pages, if any, are a separate concern.
  - **Frontend is static files** (`vite build`) served from CDN/object storage or a small container.
    The API is a separate service. Cross-origin calls use the CORS allow-list (`CLIENT_ORIGIN`).
    Locally the Vite dev server proxies API calls, so no CORS setup is needed.
  - **Browser variables use the `VITE_` prefix** (replacing `NEXT_PUBLIC_`). Never put secrets in them.
  - **Express is unopinionated**, so structure is enforced by convention (see ADR-0002) and by tests,
    notably the family-isolation rule.
  - **Web shell libraries:** react-router (locale routing). Translations and the service worker
    are written in the app itself (`apps/web/src/i18n`, `apps/web/public/sw.js`).
  - **Decorator-free code**, so tests run directly (Vitest for TypeScript, `node --test` for the API).
  - **Architecture document amendments needed:** stack section, ADRs naming NestJS/Next.js,
    deployment diagram (web becomes static hosting), and the PWA/i18n implementation notes.
