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
- ✅ Done: schema + RLS; thin-slice app = **login** + **Материали** CRUD.
- ⏭️ Next screens: цехове (workshops), машини (machines), труд (labor_roles), режийни (overheads), настройки (settings), клиенти (clients), and the **offer builder** (offers + offer_items) → **PDF export** + numbered offers + history.
- Price-calculation logic (machine-hour rate, labor, materials + waste, overhead allocation, markup, VAT) to be defined with the user from a real example.

## Conventions
- UI text in **Bulgarian**. Keep the simple vanilla-JS structure unless the user wants a framework.
- The Excel intake file (`DankoSystems_Vaprosnik_Razhodi.xlsx`) is **gitignored on purpose** — real cost data belongs in Supabase, not the public repo.
