# Offerly UI

Uses official shadcn/ui New York registry components with React and Radix.
Component sources are retained in `components/ui`; `fetch-components.mjs` records the official registry source.

Run `npm ci` then `npm run build` from this directory. Output is bundled locally into `dist/ui.js` and `dist/ui.css`; no runtime CDN is required.

The existing application model retains local storage, imports/exports, extension receipts and status transitions. React renders the list, navigation, overview, menus and dialog shell through `window.OfferlyUI`.
