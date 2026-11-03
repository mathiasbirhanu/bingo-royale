"use client";

/**
 * AdminConsole — the platform operations surface (UC-07/09/12/14), role-gated
 * by the API layer; this UI only mirrors what the server already enforces:
 *   · Engine: health, live rooms, outbox lag
 *   · Rounds: void with reason (UC-09)
 *   · Tenants: KYB lifecycle (approve / suspend / restore, UC-11/14)
 *   · Commission: per-tenant turnover rate (UC-12, OD-12 bounds)
 *   · Drafts: maker-checker queue (UC-08, self-approval structurally refused)
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Ban, CheckCircle2, Percent, ScrollText, Server, Gavel } from "lucide-react";
import { apiGet, apiPost, apiPut, etb, ApiClientError } from "@/lib/client/api";

interface EngineData {
  engine: { booted: boolean; ticks: number; lastTickAt: string | null; lastTickMs: number | null; lastError: string | null };
  liveRooms: Array<{ id: string; title: string; status: string; grossSantim: string }>;
  outboxPending: number;
}
interface RoundsData {
  id: string; title: string; variantId: string; status: string; scheduledAt: string; grossSantim: string; tickets: number; claims: number; voidReason: string | null;
}
interface TenantsData {
  tenantId: string; code: string; legalName: string; status: string;
  plans: Array<{ id: string; rateBps: number; effectiveFrom: string }>;
  accruals: Array<{ day: string; commissionSantim: string; turnoverSantim: string; rateBps: number }>;
}
interface DraftsData {
  drafts: Array<{ id: string; type: string; title: string; status: string; entityName: string | null; makerId: string; createdAt: string }>;
  entities: Array<{ id: string; type: string; name: string; tenantId: string | null; currentVersion: number; locked: boolean }>;
}

const STATUS_TONE: Record<string, string> = {
  DRAWING: "bg-accent text-accent-foreground",
  SALES_OPEN: "border-primary/60 text-primary",
  COMPLETED: "text-muted-foreground",
  APPROVED: "bg-emerald-900/40 text-emerald-400 border-emerald-700/60",
  REGISTERED: "text-muted-foreground",
  UNDER_REVIEW: "border-primary/60 text-primary",
  SUSPENDED: "bg-accent/20 text-accent-foreground border-accent/60",
  REJECTED: "bg-accent/20 text-accent-foreground border-accent/60",
};

function Tone({ status }: { status: string }) {
  return <Badge variant="outline" className={STATUS_TONE[status] ?? "text-muted-foreground"}>{status}</Badge>;
}

async function action(promise: Promise<unknown>, what: string) {
  try {
    await promise;
    toast({ title: `${what} ✓` });
    return true;
  } catch (err) {
    toast({ title: err instanceof ApiClientError ? err.code : "Failed", description: err instanceof ApiClientError ? err.message : undefined, variant: "destructive" });
    return false;
  }
}

export function AdminConsole() {
  const [engine, setEngine] = useState<EngineData | null>(null);
  const [rounds, setRounds] = useState<RoundsData[] | null>(null);
  const [tenants, setTenants] = useState<TenantsData[] | null>(null);
  const [drafts, setDrafts] = useState<DraftsData | null>(null);
  const [rateInput, setRateInput] = useState<Record<string, string>>({});
  const [voidReason, setVoidReason] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    const [e, r, t, d] = await Promise.allSettled([
      apiGet<EngineData>("/api/v1/admin/engine", { retries: 1 }),
      apiGet<RoundsData[]>("/api/v1/admin/rounds", { retries: 1 }),
      apiGet<TenantsData[]>("/api/v1/admin/commission", { retries: 1 }),
      apiGet<DraftsData>("/api/v1/admin/drafts", { retries: 1 }),
    ]);
    if (e.status === "fulfilled") setEngine(e.value);
    if (r.status === "fulfilled") setRounds(r.value);
    if (t.status === "fulfilled") setTenants(t.value);
    if (d.status === "fulfilled") setDrafts(d.value);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadAll(), 0);
    const t = setInterval(loadAll, 12_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadAll]);

  return (
    <div className="space-y-4">
      {/* Engine strip */}
      <section className="gold-frame rounded-2xl bg-card/85 p-4 space-y-2">
        <h3 className="font-bold inline-flex items-center gap-1.5"><Server className="w-4 h-4 text-primary" /> Engine</h3>
        {!engine ? (
          <Skeleton className="h-16 w-full bg-card/60" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded-lg bg-background/40 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">State</p>
              <p className={`font-bold ${engine.engine.booted && !engine.engine.lastError ? "text-emerald-500" : "text-accent"}`}>
                {engine.engine.booted ? (engine.engine.lastError ? "degraded" : "healthy") : "off"}
              </p>
            </div>
            <div className="rounded-lg bg-background/40 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ticks</p>
              <p className="font-bold tabular-nums">{engine.engine.ticks}</p>
            </div>
            <div className="rounded-lg bg-background/40 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Live rooms</p>
              <p className="font-bold tabular-nums">{engine.liveRooms.length}</p>
            </div>
            <div className="rounded-lg bg-background/40 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outbox pending</p>
              <p className={`font-bold tabular-nums ${engine.outboxPending > 0 ? "text-accent" : "text-emerald-500"}`}>{engine.outboxPending}</p>
            </div>
          </div>
        )}
        {engine?.liveRooms.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-xs bg-background/30 rounded-lg px-3 py-1.5">
            <span className="font-semibold truncate">{r.title}</span>
            <span className="flex items-center gap-2"><Tone status={r.status} /><span className="tabular-nums">{etb(r.grossSantim)} ETB</span></span>
          </div>
        ))}
      </section>

      <Tabs defaultValue="rounds">
        <TabsList className="bg-card/70 border border-border w-full justify-start overflow-x-auto">
          <TabsTrigger value="rounds"><Gavel className="w-3.5 h-3.5 mr-1" />Rounds</TabsTrigger>
          <TabsTrigger value="tenants"><Activity className="w-3.5 h-3.5 mr-1" />Tenants</TabsTrigger>
          <TabsTrigger value="commission"><Percent className="w-3.5 h-3.5 mr-1" />Commission</TabsTrigger>
          <TabsTrigger value="drafts"><ScrollText className="w-3.5 h-3.5 mr-1" />Drafts</TabsTrigger>
        </TabsList>

        {/* Rounds */}
        <TabsContent value="rounds" className="space-y-2 mt-3">
          {(rounds ?? []).slice(0, 12).map((r) => (
            <div key={r.id} className="gold-frame rounded-xl bg-card/85 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">{r.variantId} · {r.tickets} cards · {r.claims} claims · {etb(r.grossSantim)} ETB</p>
                </div>
                <Tone status={r.status} />
              </div>
              {["SALES_OPEN", "LOCKED", "DRAWING"].includes(r.status) && (
                <div className="flex gap-2">
                  <Input
                    className="h-9 text-xs"
                    placeholder="reason code (e.g. OPERATOR_REQUEST)"
                    value={voidReason[r.id] ?? ""}
                    onChange={(e) => setVoidReason((s) => ({ ...s, [r.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9 flex-none"
                    onClick={async () => {
                      const ok = await action(apiPost(`/api/v1/admin/rounds/${r.id}`, { action: "void", reasonCode: voidReason[r.id] || "OPERATOR_REQUEST" }), "Round voided + refunds posted");
                      if (ok) void loadAll();
                    }}
                  >
                    <Ban className="w-3.5 h-3.5" /> Void
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!rounds && <Skeleton className="h-24 w-full bg-card/60" />}
        </TabsContent>

        {/* Tenants */}
        <TabsContent value="tenants" className="space-y-2 mt-3">
          {(tenants ?? []).map((t) => (
            <div key={t.tenantId} className="gold-frame rounded-xl bg-card/85 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{t.code} — {t.legalName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t.plans[0] ? `commission ${(t.plans[0].rateBps / 100).toFixed(2)}% · from ${new Date(t.plans[0].effectiveFrom).toLocaleDateString()}` : "no plan"}
                  {t.accruals[0] ? ` · last accrual ${t.accruals[0].day}: ${etb(t.accruals[0].commissionSantim)} ETB` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-none">
                <Tone status={t.status} />
                {t.status !== "APPROVED" && (
                  <Button size="sm" variant="outline" className="h-8 text-xs border-primary/50 text-primary"
                    onClick={async () => { const ok = await action(apiPost(`/api/v1/admin/tenants/${t.tenantId}`, { action: "approve" }), "Tenant approved"); if (ok) void loadAll(); }}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {t.status === "APPROVED" && (
                  <Button size="sm" variant="outline" className="h-8 text-xs border-accent/60 text-accent-foreground"
                    onClick={async () => { const ok = await action(apiPost(`/api/v1/admin/tenants/${t.tenantId}`, { action: "suspend", reasonCode: "OPERATOR_REVIEW" }), "Tenant suspended"); if (ok) void loadAll(); }}>
                    <Ban className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!tenants && <Skeleton className="h-16 w-full bg-card/60" />}
        </TabsContent>

        {/* Commission */}
        <TabsContent value="commission" className="space-y-2 mt-3">
          {(tenants ?? []).map((t) => (
            <div key={t.tenantId} className="gold-frame rounded-xl bg-card/85 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{t.code}</p>
                <Badge variant="outline" className="text-primary border-primary/40">TURNOVER basis</Badge>
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-sm"
                  inputMode="decimal"
                  placeholder={`new rate % (current ${(t.plans[0]?.rateBps ?? 0) / 100}%)`}
                  value={rateInput[t.tenantId] ?? ""}
                  onChange={(e) => setRateInput((s) => ({ ...s, [t.tenantId]: e.target.value }))}
                />
                <Button
                  size="sm"
                  className="btn-gold h-9 font-bold flex-none"
                  onClick={async () => {
                    const pct = Number(rateInput[t.tenantId]);
                    if (!Number.isFinite(pct) || pct < 0 || pct > 35) {
                      toast({ title: "VALIDATION_FAILED", description: "Rate must be 0–35% (OD-12 bounds).", variant: "destructive" });
                      return;
                    }
                    const ok = await action(apiPost("/api/v1/admin/commission", { tenantId: t.tenantId, rateBps: Math.round(pct * 100) }), `Plan activated at ${pct}%`);
                    if (ok) { setRateInput((s) => ({ ...s, [t.tenantId]: "" })); void loadAll(); }
                  }}
                >
                  Set
                </Button>
              </div>
              <div className="luxe-scroll max-h-24 overflow-y-auto space-y-1">
                {t.accruals.map((a) => (
                  <div key={a.day} className="flex justify-between text-[11px] text-muted-foreground bg-background/30 rounded px-2 py-1">
                    <span>{a.day} @ {(a.rateBps / 100).toFixed(2)}%</span>
                    <span>turnover {etb(a.turnoverSantim)} → fee {etb(a.commissionSantim)} ETB</span>
                  </div>
                ))}
                {t.accruals.length === 0 && <p className="text-[11px] text-muted-foreground">No accruals yet — they post when partner rounds complete.</p>}
              </div>
            </div>
          ))}
          {!tenants && <Skeleton className="h-16 w-full bg-card/60" />}
        </TabsContent>

        {/* Drafts (maker-checker) */}
        <TabsContent value="drafts" className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Config changes flow maker → checker → publish (UC-08). Self-approval is structurally refused.</p>
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={async () => { const ok = await action(apiPut("/api/v1/admin/drafts"), "Scheduler topped up"); if (ok) void loadAll(); }}>
              Top up rooms
            </Button>
          </div>
          {(drafts?.drafts ?? []).slice(0, 10).map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card/70 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{d.title}</p>
                <p className="text-[11px] text-muted-foreground">{d.type}{d.entityName ? ` · ${d.entityName}` : " · new entity"} · maker {d.makerId.slice(-4)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-none">
                <Tone status={d.status} />
                {d.status === "PENDING" && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-primary/50 text-primary"
                      onClick={async () => { const ok = await action(apiPost(`/api/v1/admin/drafts/${d.id}`, { action: "approve" }), "Draft approved + published"); if (ok) void loadAll(); }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-accent/60 text-accent-foreground"
                      onClick={async () => { const ok = await action(apiPost(`/api/v1/admin/drafts/${d.id}`, { action: "reject", reason: "operator rejection" }), "Draft rejected"); if (ok) void loadAll(); }}>
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {drafts && drafts.drafts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No drafts in the pipeline.</p>}
          {!drafts && <Skeleton className="h-16 w-full bg-card/60" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
