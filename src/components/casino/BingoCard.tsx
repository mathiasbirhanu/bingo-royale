"use client";

/**
 * BingoCard — one ticket, PER-CARD manual play (the owner's rule):
 *   · tapping a number marks THIS card only — the same number on another
 *     card stays empty until the player finds and taps it there too;
 *   · a called-but-undaubed cell glows gold (the find-me hint);
 *   · tapping a number that has NOT been called buzzes + shakes red and
 *     marks nothing (real-money safe);
 *   · the per-card BINGO! button arms when THIS card completes an open
 *     pattern with its own daubs; a failed claim flashes "NOT YET!", locks
 *     the button for 3 seconds (anti-spam) and the server re-validates
 *     every claim — manual marking is the game, never the trust.
 *
 * The same cells render 5×5 (75-ball, FREE centre) and 3×9 (90-ball strip).
 * 75-ball column headers carry the classic per-letter colours (B crimson,
 * I gold, N emerald, G bronze, O rose) — the Royale warm palette.
 */
import { memo, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";

/** Warm header colours — no blue, matches the THEMES palette. */
const LETTER_COLORS = [
  "oklch(0.66 0.2 25)",   // B — crimson
  "oklch(0.8 0.15 88)",   // I — gold
  "oklch(0.64 0.13 155)", // N — emerald
  "oklch(0.62 0.11 50)",  // G — bronze
  "oklch(0.68 0.17 12)",  // O — rose
];

interface Props {
  cells: (number | null)[][];
  variantId: string;
  /** Balls called so far (server truth — drives hints + tap validity). */
  called: ReadonlySet<number>;
  /** THIS card's daubs only — per-card manual marking, never shared. */
  daubed: ReadonlySet<number>;
  /** Last number daubed on THIS card (fresh-pop animation). */
  fresh: number | null;
  /** Manual mode: cells are tappable and the find-me hint glows. */
  interactive?: boolean;
  onTapCell?: (n: number) => void;
  /** Invalid-tap feedback on this card: { n, k } — k re-triggers the shake. */
  shake?: { n: number; k: number } | null;
  /** Brief red "NOT YET!" flash after this card's claim failed. */
  notYet?: boolean;
  /** Render the per-card BINGO! claim button (manual rooms, while drawing). */
  showBingo?: boolean;
  /** THIS card completed an open pattern with its own daubs. */
  bingo?: boolean;
  claiming?: boolean;
  /** Epoch ms until which the button stays locked after a failed claim. */
  lockUntil?: number | null;
  onClaim?: () => void;
  compact?: boolean;
}

export const BingoCard = memo(function BingoCard({
  cells,
  variantId,
  called,
  daubed,
  fresh,
  interactive = false,
  onTapCell,
  shake,
  notYet = false,
  showBingo = false,
  bingo = false,
  claiming = false,
  lockUntil = null,
  onClaim,
  compact,
}: Props) {
  const is75 = variantId === "BALL_75";
  const cols = is75 ? 5 : 9;
  const headers = is75 ? ["B", "I", "N", "G", "O"] : Array.from({ length: 9 }, (_, i) => (i + 1).toString());
  const shakeK = shake?.k ?? 0;

  // Lock countdown — ticks only while a lock is active. No synchronous
  // setState: the interval corrects the countdown within 250ms of arming.
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [lockUntil]);
  const locked = !!lockUntil && lockUntil > now;

  return (
    <div className={`gold-frame rounded-xl bg-card/90 overflow-hidden ${compact ? "p-1.5" : "p-2.5"}`}>
      {/* Column headers — 75-ball gets the coloured BINGO letters */}
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {headers.map((h, i) => (
          <div
            key={`h-${i}`}
            className={`text-center font-black rounded-md ${is75 ? "" : "text-muted-foreground/70 text-[9px]"}`}
            style={
              is75
                ? { color: LETTER_COLORS[i], background: `${LETTER_COLORS[i]}22`, textShadow: "0 1px 0 oklch(0 0 0 / 35%)" }
                : undefined
            }
          >
            {h}
          </div>
        ))}
      </div>
      {/* Grid */}
      {cells.map((row, r) => (
        <div key={r} className="grid gap-1 mb-1 last:mb-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {row.map((n, c) => {
            const isFree = n === null && is75 && r === 2 && c === 2;
            const cellMarked = isFree || (n !== null && daubed.has(n));
            // The find-me hint: the ball was called but THIS card's cell was
            // not tapped yet — a gold pulse ring invites the tap.
            const hinted = !cellMarked && n !== null && called.has(n);
            const freshCell = n !== null && cellMarked && n === fresh;
            const shaking = n !== null && shake?.n === n;
            const cell = (
              <div
                key={c}
                className={`relative flex items-center justify-center rounded-md select-none transition-shadow
                  ${compact ? "h-8 text-[13px]" : "h-10 text-[15px]"}
                  ${shaking ? "cell-shake cell-buzz" : ""}
                  ${freshCell ? "cell-fresh" : ""}
                  ${hinted ? "cell-glow" : ""}
                  ${n === null
                    ? isFree
                      ? "bg-primary/15 text-primary"
                      : "bg-background/30"
                    : cellMarked
                      ? "bg-background/25 text-transparent"
                      : "bg-secondary/70 text-foreground font-bold"}`}
                aria-label={n === null ? (isFree ? "free square" : "blank") : cellMarked ? `${n} marked` : hinted ? `${n} called — tap to daub` : String(n)}
              >
                {n === null ? (
                  isFree ? <Star className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} fill="currentColor" />
                  : <span className="text-muted-foreground/30 text-[10px]">·</span>
                ) : (
                  <>
                    <span className={cellMarked ? "opacity-30" : ""}>{n}</span>
                    {cellMarked && <span className={`daub ${freshCell ? "" : "animate-none"}`} />}
                  </>
                )}
                {n !== null && cellMarked && (
                  <span className={`absolute inset-0 flex items-center justify-center font-black text-white/95 ${compact ? "text-[13px]" : "text-[15px]"}`}>
                    {n}
                  </span>
                )}
              </div>
            );
            if (!interactive || n === null) return cell;
            return (
              <button
                key={`${c}-${shaking ? shakeK : 0}`}
                type="button"
                className="text-left cursor-pointer active:scale-95 transition-transform"
                aria-label={cellMarked ? `${n} marked` : hinted ? `Tap to daub ${n}` : String(n)}
                onClick={() => n !== null && onTapCell?.(n)}
              >
                {cell}
              </button>
            );
          })}
        </div>
      ))}

      {/* Per-card BINGO! claim — arms only for THIS card's own daubs */}
      {showBingo && (
        <button
          type="button"
          disabled={!bingo || claiming || locked}
          onClick={onClaim}
          aria-live="polite"
          className={`mt-1.5 w-full min-h-10 rounded-lg font-black tracking-widest text-base btn-juice transition-all
            ${notYet
              ? "bingo-deny bg-destructive text-white"
              : bingo && !locked
                ? "bingo-ready bg-accent text-accent-foreground cursor-pointer"
                : "bg-secondary/60 text-muted-foreground cursor-not-allowed"}`}
        >
          {claiming ? (
            <Loader2 className="w-4 h-4 animate-spin inline" />
          ) : notYet ? (
            "✕ NOT YET!"
          ) : locked ? (
            lockUntil ? `WAIT ${Math.max(1, Math.ceil((lockUntil - now) / 1000))}s` : "WAIT…"
          ) : bingo ? (
            "⚡ BINGO!"
          ) : (
            "BINGO!"
          )}
        </button>
      )}
    </div>
  );
});
