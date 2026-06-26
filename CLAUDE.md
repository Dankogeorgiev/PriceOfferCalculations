# PriceOfferCalculations — DankoSystems

> **Communicate with the user (Danko Georgiev) in Bulgarian.**

## What this is
A web app for **DankoSystems**, a manufacturing company (multiple workshops/цехове and machines), to roll up costs, calculate prices, and produce numbered client offers (with PDF export and a saved history). The user's priority: **first collect ALL cost types**, enter data, then refine structure. Not in a hurry — prefers a question-and-answer style.

## Architecture
- **Frontend:** plain HTML + vanilla JS + `@supabase/supabase-js@2` (from CDN). No build step.
  - `index.html` — app shell (login view + app view)
  - `app.js` — Supabase client, auth (login/logout), Материали CRUD
  - `config.js` — Supabase URL + **anon** key (public by design; safe to commit)
  - `styles.css`
- **Backend:** **Supabase** (Postgres + Auth). Project URL: `https://epgyekgayrmwsevxucva.supabase.co`
- **Hosting:** **GitHub Pages** from this **public** repo. Live at **https://dankogeorgiev.github.io/PriceOfferCalculations/** — auto-deploys ~1–2 min after each push to `main`.

## Database schema (v1, deployed)
10 tables: `workshops`, `machines`, `labor_roles`, `materials`, `overheads`, `settings`, `clients`, `products`, `offers`, `offer_items`.
- FKs: `machines.workshop_id`→workshops, `labor_roles.workshop_id`→workshops, `offers.client_id`→clients, `offer_items.offer_id`→offers, `offer_items.product_id`→products.
- **RLS is enabled** on all 10 tables with an `authenticated_all` policy = full access for logged-in users only (anon blocked).

## Security model
- Repo & app are **public**, but data lives in Supabase behind **login** (Supabase Auth, email/password).
- **Public sign-ups are disabled** — only manually-created users may log in. Keep it that way.
- The `authenticated_all` RLS policy means any logged-in user sees everything (fine for a small trusted team). Refine per-user later if needed.

## Status & next steps
- ✅ Done: schema + RLS; reference data loaded (workshops, machines, operation_rates, laser_rates, material_weights/densities).
- ✅ App has tabs: **Калкулатор** (part cost: materials auto-weight / laser / operations → per-section margins +50% mat&labour, +150% laser → ÷1.95583 → EUR), **Разкрой** (1D bar cutting-stock optimizer: editable bar length, kerf 2/3/4/5 mm, colored layout, **A4 PDF export**), **Справочни данни** (цехове, машини, ставки по операция, лазерни цени, материали — CRUD).
- ⚠️ **Do NOT rebuild the разкрой / bar-cut tool** — it already exists as the "Разкрой" tab (a parallel duplicate `bar-cut.html`/`bar-cut.js` built in the cloud was removed/merged).
- ⏭️ Next: more calc sections (щанца, струг/фреза, боядисване, външни), **editable margins**, save part/offer, the **offer builder** (offers + offer_items) → PDF + numbered history.
- Margins/rates use the user's existing лв values; calibrate against the real example part `54.0056.75` (≈14.45 €/pc).

## Conventions
- UI text in **Bulgarian**. Keep the simple vanilla-JS structure unless the user wants a framework.
- The Excel intake file (`DankoSystems_Vaprosnik_Razhodi.xlsx`) is **gitignored on purpose** — real cost data belongs in Supabase, not the public repo.
