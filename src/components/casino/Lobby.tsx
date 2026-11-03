"use client";

/**
 * Lobby — the casino floor: live room cards with countdowns, prize pools and
 * one-tap entry. Polls the room list on a slow cycle (low-data: this endpoint
 * is a few hundred bytes; the live action happens inside a room only).
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Ticket, Trophy, Timer } from "lucide-react";
import { apiGet, etb } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { usePhase, phaseCopy } from "@/lib/phase";
import { ROOM_STATUS_LABEL, type RoomListItem } from "@/lib/client/types";

function Countdown({ target, status }: { target: string; status: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (status !== "SCHEDULED" && status !== "SALES_OPEN") return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return <span className="tabular-nums text-primary font-bold">starting…</span>;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className="tabular-nums text-primary font-bold inline-flex items-center gap-1">
      <Timer className="w-3.5 h-3.5" />
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

function RoomCard({ room, onEnter }: { room: RoomListItem; onEnter: () => void }) {
  const live = room.status === "DRAWING";
  const salesOpen = room.status === "SALES_OPEN";
  return (
    <article className={`gold-frame rounded-2xl bg-card/85 p-4 space-y-3 ${live ? "ring-1 ring-accent/60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold truncate text-[15px]">{room.title}</h3>
          <p className="text-xs text-muted-foreground">
            {room.variantId === "BALL_75" ? "75-ball · American" : "90-ball · UK style"}
            {room.tenantId ? " · partner hall" : " · house hall"}
          </p>
        </div>
        {live ? (
          <Badge className="bg-accent text-accent-foreground gap-1.5">
            <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-white" /> LIVE
          </Badge>
        ) : (
          <Badge variant="outline" className={salesOpen ? "border-primary/60 text-primary" : "text-muted-foreground"}>
            {ROOM_STATUS_LABEL[room.status] ?? room.status}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/50 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Card</p>
          <p className="font-bold text-primary text-sm">{etb(room.priceSantim)} <span className="text-[10px] font-normal text-muted-foreground">ETB</span></p>
        </div>
        <div className="rounded-lg bg-background/50 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Players</p>
          <p className="font-bold text-sm inline-flex items-center gap-1"><Users className="w-3 h-3 text-muted-foreground" />{room.players}</p>
        </div>
        <div className="rounded-lg bg-background/50 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cards</p>
          <p className="font-bold text-sm inline-flex items-center gap-1"><Ticket className="w-3 h-3 text-muted-foreground" />{room.tickets}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {live || salesOpen ? (
            <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-primary" /><Countdown target={room.scheduledAt} status={room.status} /></span>
          ) : (
            <span>Opens <Countdown target={room.salesOpenAt} status={room.status} /></span>
          )}
        </div>
        <Button size="sm" className="btn-gold font-bold min-h-10 px-5" onClick={onEnter}>
          {live ? "Watch live" : salesOpen ? "Buy cards" : "Preview"}
        </Button>
      </div>
    </article>
  );
}

export function Lobby() {
  const { openRoom, setBalance } = useApp();
  const phase = usePhase();
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<RoomListItem[]>("/api/v1/rooms", { retries: 2, timeoutMs: 9000 });
      setRooms(data);
      setError(null);
    } catch {
      setError("The hall is momentarily unreachable — retrying…");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    void apiGet<{ balanceDisplay: string }>("/api/v1/wallet").then((w) => setBalance(w.balanceDisplay)).catch(() => undefined);
    const t = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, setBalance]);

  const order: Record<string, number> = { DRAWING: 0, SALES_OPEN: 1, LOCKED: 2, SCHEDULED: 3, RESOLVING: 4, COMPLETED: 5, VOIDED: 6 };
  const sorted = rooms ? [...rooms].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()) : null;

  return (
    <div className="space-y-4">
      <div className="marquee gold-frame rounded-xl bg-card/70 py-2" aria-hidden>
        <div className="marquee-track text-xs text-muted-foreground">
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex gap-10">
              <span>🎰 {phaseCopy.lobbyBanner(phase)}</span>
              <span>🏆 Winners are paid from the live pool, floor-division exact</span>
              <span>🔐 Every draw is commit-reveal verifiable</span>
              <span>📱 Works on 2G — server-side auto-daub, tiny payloads</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg gold-text">The Floor</h2>
        <span className="text-xs text-muted-foreground">{rooms ? `${rooms.length} rounds on the board` : "dealing…"}</span>
      </div>

      {error && <p className="text-accent-foreground bg-accent/20 border border-accent/40 rounded-lg px-3 py-2 text-sm">{error}</p>}

      {!sorted && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl bg-card/60" />)}
        </div>
      )}

      <div className="space-y-3">
        {sorted?.map((room) => <RoomCard key={room.id} room={room} onEnter={() => openRoom(room.id)} />)}
      </div>
    </div>
  );
}
