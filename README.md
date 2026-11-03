# 🃏 Bingo Royale — Build 1 (demo-phase reference implementation)

Real-money bingo platform for Ethiopia — 75-ball & 90-ball, provably-fair
commit-reveal draws, double-entry ledger, multi-tenant B2B (KYB, per-tenant
commission, immutable statements), casino-flavor low-bandwidth PWA.

Built against **SRS v5.0 · Architecture v5.0 · Delivery Plan v1.0** — see
`docs/COMPLIANCE_MATRIX.md` for requirement→evidence mapping and
`docs/GO_LIVE_CHECKLIST.md` for the demo→production path.

---

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Bun** | 1.1+ (https://bun.sh — `curl -fsSL https://bun.sh/install \| bash`) | runtime, package manager, test runner |
| **VS Code** | any recent | recommended extensions below |
| Docker Desktop *(optional)* | any | only if you want the PG16/Redis/NATS compose stack |

**VS Code extensions (recommended):** ESLint (`dbaeumer.vscode-eslint`),
Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`), Prisma
(`Prisma.prisma`), Error Lens, Pretty TS Errors.

Node.js is *not* required (Bun replaces it), but ≥20 works too via `npm`/`npx`
if you prefer — swap `bun` for `npm run`/`npx` in the commands below.

## 2. Install & run (5 minutes)

```bash
# 1 — unzip, enter the project
cd bingo-royale

# 2 — configure the database path
cp .env.example .env
#   .env content:  DATABASE_URL="file:../db/custom.db"
#   (relative to prisma/ — this points at the seeded demo DB in db/)

# 3 — install dependencies
bun install

# 4 — generate the Prisma client + sync schema
bun run db:generate
bun run db:push

# 5 — start the platform (game engine boots itself via instrumentation)
bun run dev
```

Open **http://localhost:3000** — the casino landing appears.

> **Fresh world instead of the shipped demo data?** Delete `db/custom.db`,
> run `bun run db:push`, then `bun run scripts/seed.ts` (idempotent — safe to
> re-run any time).

## 3. Sign in and play (the 5-minute tour)

The OTP is shown on-screen in DEMO mode (no real SMS is sent — `FR-PAY`
demo adapter). Personas from the seed:

| Persona | Phone | What to try |
|---------|-------|-------------|
| **Player** | `+251 911 000003` | Lobby → enter a room during SALES_OPEN → buy cards → watch the draw, auto-daub, automatic prize payout |
| **Tenant owner** | `+251 911 000002` | Portal nav: content drafts (maker-checker), KYB dossier, statements |
| **Platform admin** | `+251 911 000001` | Console nav: engine health, round void + refunds, tenant KYB, per-tenant commission, finance payout |

Full scripted walk-through with expected values: **`docs/REVIEW_GUIDE.md`**.

## 4. Optional: live fan-out hub (real-time room updates)

The room view falls back to REST polling without it — add the hub for the
real-time feel (second terminal):

```bash
cd mini-services/room-events
bun install
bun run index.ts     # port 3003
```

## 5. Optional: production-shape data plane (Docker)

```bash
docker compose -f infra/compose/docker-compose.yml up -d
# PostgreSQL 16 + Redis 7 (noeviction) + NATS JetStream + Prometheus
# The web app keeps using SQLite until you point DATABASE_URL at Postgres
# and apply prisma/rls-postgres.sql — see docs/GO_LIVE_CHECKLIST.md D2.
```

## 6. Quality gates (run these before every commit)

```bash
bun run lint          # ESLint — must be clean
bunx tsc --noEmit     # TypeScript strict — 0 errors
bun test              # 48 tests / 1,731 assertions (ledger, game-core,
                      #   commission, prize, telebirr adapter)
bunx prisma validate  # schema valid
```

CI runs the same gates + an RLS cross-tenant leakage suite against real
PostgreSQL (`infra/ci/pipeline.yml`).

## 7. Project map (every module in its own folder, as built)

```
src/
  modules/            ← bounded domain modules (no framework imports)
    authn/            UC-01 phone+OTP sessions
    ledger/           double-entry journal, balances, accounts
    payment/          FR-PAY port + DEMO adapter + telebirr adapter
    game-core/        variants, cards, fingerprints, RNG, commit-reveal
    rooms/  engine/   purchase/void; room lifecycle + draw ticks
    config-control/   versioned config, maker-checker drafts
    prize/            rulesets, tier splits, guardrails
    commission/       turnover accrual, statements, payouts
    tenancy/          KYB lifecycle, tenant vault
    reporting/        round + reconciliation reports
  app/api/v1/         REST surface (one folder per resource)
  components/casino/  PWA surfaces (Landing, Lobby, Room, Wallet, Portal, Console)
  lib/                env, money (int64 santim), crypto, auth, phase copy
mini-services/room-events/   socket.io fan-out hub (the SignalR role)
infra/               compose · docker (2 Dockerfiles) · terraform (dev/staging/demo)
                     · observability (Prometheus) · ci (GitHub Actions)
docs/                REVIEW_GUIDE · COMPLIANCE_MATRIX · GO_LIVE_CHECKLIST · adr/
prisma/              schema.prisma + rls-postgres.sql (PG16 row-level security)
```

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `PrismaClientInitializationError` on boot | `.env` missing or path wrong — must be `file:../db/custom.db` (relative to `prisma/`) |
| `P1003` / empty lobby | DB has no data — run `bun run scripts/seed.ts` |
| Port 3000 busy | `bun run dev -- -p 3001` |
| `INVALID_OR_EXPIRED_OTP` | OTP lives 5 min — request a new one; max 5 requests/minute (rate limit is a feature) |
| Room stuck on "waiting" | Engine boots with the server — check the terminal for `[engine]` lines; rooms roll from seeded templates |
| Windows: path errors in prisma | Run from the project root; keep forward slashes in `.env` |
| Tests hit a shared DB | They use unique idempotency keys — safe to re-run; `bun run db:push` resets if you want pristine |

## 9. What "demo" means (read this once)

Everything is real engineering: balanced double-entry ledger, commit-reveal
fairness, RLS tenant isolation, idempotency, maker-checker, immutable
statements. **Only the money rail is simulated** (DEMO mode, mode-guarded —
`FR-PAY-04`), because real rails need business artifacts: the telebirr
merchant pack, SMS contract, licensing. The production telebirr adapter ships
here in DRY_RUN; the flip is `PAYMENT_MODE=LIVE` + credentials. Path:
`docs/GO_LIVE_CHECKLIST.md`.

## 10. Where to read first

1. `docs/REVIEW_GUIDE.md` — what's running, the 5-minute demo, module test checklist
2. `docs/COMPLIANCE_MATRIX.md` — every SRS use case mapped to proof
3. `docs/GO_LIVE_CHECKLIST.md` — demo-first → launch-ready, owned and dated
4. `docs/adr/` — the 29 architecture decision records
# bingo-royale
# bingo-royale
