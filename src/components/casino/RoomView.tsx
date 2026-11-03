"use client";

/**
 * RoomView — the live round. Composition:
 *   · ball rail (server-cadenced countdown, last balls, full history strip)
 *   · my cards with auto-daub (ADR-20) and win banners (ADR-16 honest UX)
 *   · live prize table (same maths as the engine — FR-PLY-02)
 *   · buy-cards flow during SALES_OPEN (idempotent, retry-safe)
 *   · fairness chip → commitment; reveal data after completion (UC-06)
 * Transport: useRoomLive (socket push → REST sequence catch-up fallback).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Trophy, ShieldCheck, Loader2, ChevronLeft, Lock, Wifi, WifiOff, PartyPopper } from "lucide-react";
import { apiGet, apiPost, etb, newIdempotencyKey, ApiClientError } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { useRoomLive } from "@/lib/client/useRoomLive";
import { ROOM_STATUS_LABEL, ballClass, type RoomDetail } from "@/lib/client/types";
import { BingoCard } from "./BingoCard";

function BallRail({ balls, nextBallInMs, intervalMs, status }: { balls: Array<{ seq: number; ball: number }>; nextBallInMs: number | null; intervalMs: number; status: string }) {
  const last = balls[balls.length - 1] ?? null;
  const prev = balls.slice(-6, -1).reverse();
  // Countdown as derived state: a deadline memo (recomputed only when the
  // server cadence changes) minus a 100ms clock — no sync setState effects.
  const deadline = useMemo(() => (nextBallInMs === null ? null : Date.now() + nextBallInMs), [nextBallInMs]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "DRAWING") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [status]);
  const eta = deadline === null ? null : Math.max(0, deadline - now);

  const recent = balls.slice(-24).reverse();

  return (
    <section className="gold-frame rounded-2xl bg-card/85 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Badge className={status === "DRAWING" ? "bg-accent text-accent-foreground gap-1.5" : "bg-secondary text-secondary-foreground"}>
          {status === "DRAWING" && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-white" />}
          {ROOM_STATUS_LABEL[status] ?? status}
        </Badge>
        {status === "DRAWING" && (
          <span className="text-xs text-muted-foreground tabular-nums">
            next ball in {((eta ?? intervalMs) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 py-1">
        <div className="flex gap-2 opacity-70">
          {prev.map((b) => (
            <span key={b.seq} className={`ball-sphere ${ballClass(b.ball)} w-9 h-9 text-sm`}>{b.ball}</span>
          ))}
        </div>
        {last ? (
          <span className={`ball-sphere ${ballClass(last.ball)} w-20 h-20 text-4xl ${status === "DRAWING" ? "ball-fresh" : ""}`} key={last.seq}>
            {last.ball}
          </span>
        ) : (
          <span className="w-20 h-20 rounded-full border border-dashed border-primary/40 grid place-items-center text-xs text-muted-foreground">
            {status === "SALES_OPEN" ? "buy & wait" : "…"}
          </span>
        )}
      </div>

      <div className="luxe-scroll flex gap-1 overflow-x-auto pb-1">
        {balls.map((b) => (
          <span key={b.seq} className={`ball-sphere ${ballClass(b.ball)} w-6 h-6 text-[10px] flex-none`}>{b.ball}</span>
        ))}
        {balls.length === 0 && <span className="text-xs text-muted-foreground py-1">no balls called yet</span>}
      </div>
    </section>
  );
}

export function RoomView({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const { user, setBalance } = useApp();
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [reveal, setReveal] = useState<{ commitment: string; serverSeed: string; salt: string; clientSeedContribution: string } | null>(null);
  const [buying, setBuying] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<RoomDetail>(`/api/v1/rooms/${roomId}`, { retries: 2 });
      setDetail(d);
    } catch {
      /* room list refresh will recover; keep the last view */
    }
  }, [roomId]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(load, 8_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const live = useRoomLive(roomId, detail?.status ?? "SCHEDULED");
  const calledSet = useMemo(() => new Set(live.balls.map((b) => b.ball)), [live.balls]);
  const freshBall = live.balls.length ? live.balls[live.balls.length - 1].ball : null;

  // My confirmed wins in this room — award winners carry the player id on
  // both transports (REST catch-up + socket), so ownership is client-side.
  const myWins = live.awards.filter((a) => a.winners.some((w) => w[2] === user?.id));
  const anyWin = live.awards.length > 0;

  const [wonFlash, setWonFlash] = useState<string | null>(null);
  useEffect(() => {
    if (myWins.length > 0) {
      const latest = myWins[myWins.length - 1];
      setWonFlash(`${latest.label} — ${latest.winners[0][1]} ETB`);
      // Prize landed — refresh the balance chip immediately (money truth).
      void apiGet<{ balanceDisplay: string }>("/api/v1/wallet", { retries: 1 })
        .then((w) => setBalance(w.balanceDisplay))
        .catch(() => undefined);
    }
  }, [myWins.length, setBalance]);

  useEffect(() => {
    if (detail && (detail.status === "COMPLETED" || detail.status === "RESOLVING")) {
      void apiGet<{ commitment: string; reveal: { serverSeed: string; salt: string; clientSeedContribution: string } | null }>(
        `/api/v1/fairness/${roomId}`
      )
        .then((d) => d.reveal && setReveal({ commitment: d.commitment, ...d.reveal }))
        .catch(() => undefined);
    }
  }, [detail?.status, roomId]);

  const buy = async () => {
    setBuying(true);
    try {
      const res = await apiPost<{ replayed: boolean; newBalanceSantim: string; cards: unknown[] }>(`/api/v1/rooms/${roomId}/purchase`, {
        quantity,
        idempotencyKey: newIdempotencyKey("buy"),
      });
      setBalance(etb(res.newBalanceSantim));
      toast({ title: res.replayed ? "Purchase already confirmed" : `${quantity} card${quantity > 1 ? "s" : ""} confirmed!`, description: "Good luck in there 🍀" });
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const copy: Record<string, string> = {
          INSUFFICIENT_FUNDS: "Not enough balance — top up in the wallet.",
          MAX_CARDS_REACHED: "You reached the card limit for this round.",
          SALES_CLOSED: "Sales just closed — the round is starting.",
        };
        toast({ title: err.code, description: copy[err.code] ?? err.message, variant: "destructive" });
      }
    } finally {
      setBuying(false);
    }
  };

  if (!detail) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Lobby</Button>
        <Skeleton className="h-44 w-full rounded-2xl bg-card/60" />
        <Skeleton className="h-64 w-full rounded-2xl bg-card/60" />
      </div>
    );
  }

  const salesOpen = detail.status === "SALES_OPEN";
  const finished = detail.status === "COMPLETED" || detail.status === "VOIDED";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Lobby</Button>
        <span className={`inline-flex items-center gap-1 text-[11px] ${live.transport === "socket" ? "text-emerald-500" : "text-muted-foreground"}`}>
          {live.transport === "socket" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {live.transport === "socket" ? "live push" : live.transport === "polling" ? "data-saver sync" : "connecting"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-lg gold-text truncate">{detail.title}</h2>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{etb(detail.priceSantim)} ETB / card</span>
      </div>

      <BallRail balls={live.balls} nextBallInMs={live.nextBallInMs} intervalMs={detail.ballIntervalMs} status={live.status} />

      {/* Win banner (ADR-16: PROVISIONAL shows as "checking"; CONFIRMED celebrates) */}
      {wonFlash && (
        <div className="rounded-xl border border-primary/60 bg-primary/15 px-4 py-3 flex items-center gap-2 pulse-gold" role="status">
          <PartyPopper className="w-5 h-5 text-primary flex-none" />
          <p className="text-sm font-bold text-primary">Winner! {wonFlash} — credited instantly.</p>
        </div>
      )}

      {/* Prize table */}
      <section className="gold-frame rounded-2xl bg-card/85 p-4 space-y-2">
        <h3 className="text-sm font-bold inline-flex items-center gap-1.5"><Trophy className="w-4 h-4 text-primary" /> Prize table — live pool</h3>
        <div className="space-y-1.5">
          {detail.prizeTable.map((row) => {
            const paidRow = live.awards.find((a) => a.label === row.patternLabel);
            return (
              <div key={row.patternId} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${paidRow ? "bg-primary/10 line-through decoration-primary/60" : "bg-background/40"}`}>
                <span className="font-semibold">{row.patternLabel}</span>
                {/* Paid tiers freeze at the amount actually awarded; open tiers
                    track the live pool (FR-PLY-02). */}
                <span className={`font-bold tabular-nums ${paidRow ? "text-primary" : ""}`}>
                  {paidRow ? paidRow.winners.map((w) => w[1]).join(" / ") : etb(row.tierSantim)}
                  <span className="text-[10px] font-normal text-muted-foreground"> ETB</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Pool grows with every confirmed sale. Simultaneous winners split the tier evenly; the floor remainder stays in the round.</p>
      </section>

      {/* Purchase bar */}
      {salesOpen && user && (
        <section className="gold-frame rounded-2xl bg-card/85 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Buy cards <span className="text-muted-foreground font-normal">(max {detail.maxCards})</span></h3>
            <span className="text-xs text-muted-foreground">You hold {detail.myTickets.length}</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 4, 6].filter((q) => detail.myTickets.length + q <= detail.maxCards).map((q) => (
              <button
                key={q}
                onClick={() => setQuantity(q)}
                aria-pressed={quantity === q}
                className={`flex-1 min-h-10 rounded-lg text-sm font-bold border transition-colors ${quantity === q ? "border-primary bg-primary/20 text-primary" : "border-border bg-background/40 hover:border-primary/50"}`}
              >
                ×{q}
              </button>
            ))}
          </div>
          <Button className="btn-gold w-full font-black min-h-11 text-base" disabled={buying || detail.myTickets.length >= detail.maxCards} onClick={buy}>
            {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : `Buy ${quantity} for ${etb(String(Number(detail.priceSantim) * quantity))} ETB`}
          </Button>
        </section>
      )}
      {salesOpen && !user && <p className="text-center text-sm text-muted-foreground">Sign in from the lobby to buy cards.</p>}

      {/* My cards */}
      {detail.myTickets.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold px-1">My cards ({detail.myTickets.length}) — auto-daubed for you</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {detail.myTickets.map((t) => (
              <BingoCard key={t.ticketId} cells={t.numbers} variantId={detail.variantId} called={calledSet} freshBall={freshBall} />
            ))}
          </div>
        </section>
      )}

      {/* Winners feed */}
      {anyWin && (
        <section className="gold-frame rounded-2xl bg-card/85 p-4 space-y-2">
          <h3 className="text-sm font-bold">Winners this round</h3>
          <div className="luxe-scroll max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {[...live.awards].reverse().map((a) => (
              <div key={`${a.seq}|${a.label}`} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm">
                <span className="font-semibold text-primary">{a.label}</span>
                <span className="text-xs text-muted-foreground">
                  ball #{live.balls.find((b) => b.seq === a.seq)?.ball ?? a.seq} ·{" "}
                  {a.winners.map((w) => `${w[0]} +${w[1]}`).join(", ")} ETB
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fairness */}
      <section className="rounded-xl border border-border/60 bg-card/60 p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-none" />
        <div className="text-[11px] text-muted-foreground space-y-1">
          {!finished ? (
            <p>
              Fairness commitment is published at lock and verifiable on completion.
              The draw sequence is fixed before the first ball and cannot change.
            </p>
          ) : reveal ? (
            <details>
              <summary className="cursor-pointer text-foreground/90 font-semibold">Draw provenance revealed — verify it yourself</summary>
              <p className="mt-1">server seed <span className="font-mono break-all text-foreground/70">{reveal.serverSeed}</span></p>
              <p>salt <span className="font-mono text-foreground/70">{reveal.salt}</span></p>
              <p>client-seed contribution <span className="font-mono break-all text-foreground/70">{reveal.clientSeedContribution}</span></p>
              <p>commitment <span className="font-mono break-all text-foreground/70">{reveal.commitment}</span></p>
              <p className="pt-1">SHA-256(seed:salt) must equal the commitment; the ball order regenerates from the seed with the same public code.</p>
            </details>
          ) : (
            <p className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Seed sealed until the round settles.</p>
          )}
        </div>
      </section>
    </div>
  );
}
