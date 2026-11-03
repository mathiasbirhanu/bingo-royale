# Bingo Royale — Ethiopia real-money bingo platform (B2B multi-tenant)

Next.js 16 + Bun + Prisma/SQLite (dev) · Postgres+RLS (prod) · Turbopack dev server.

## Run in VS Code (fast path)

**One-time setup (per machine, ~2 min):**

```bash
bun install            # or: bun run setup  (install + prisma generate + db push)
cp .env.example .env   # portable DATABASE_URL — never commit .env
bun run setup          # prisma generate + db push (idempotent, safe to re-run)
```

**Start dev (≈5–6 s to ready):**

```bash
bun run dev            # http://localhost:3000
```

- In VS Code: press `F5` → "Bingo: dev (bun, fast run)", or `Ctrl+Shift+B` → task **dev: next dev (bun)**.
- Need breakpoints? `F5` → "Bingo: debug server (node breakpoints)" (requires Node.js installed alongside Bun).
- VS Code will recommend extensions on open (Bun, Tailwind, Prisma, ESLint) — accept them.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Next dev server on :3000 (Turbopack, no logging pipe — works in PowerShell/cmd/bash) |
| `bun run dev:log` | Same, but mirrors output to `dev.log` (bash-only) |
| `bun run setup` | `bun install` + `prisma generate` + `db push` — run after pulling changes |
| `bun run lint` | ESLint |
| `bun test` | Full test suite |
| `bun run build` / `bun start` | Production build (standalone) + start |

## Windows notes

- The old `… | tee dev.log` script **did not work in PowerShell/cmd** — it was removed. `bun run dev` now runs clean everywhere.
- If Bun is missing: `powershell -c "irm bun.sh/install.ps1 | iex"`, then restart the VS Code terminal.

## Docs

- `docs/REVIEW_GUIDE.md` — verification record + how to review the platform
- `docs/GO_LIVE_CHECKLIST.md` — demo-first → launch-ready path
- `docs/adr/` — architecture decision records
