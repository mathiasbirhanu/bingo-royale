"use client";

/**
 * BingoCard — renders one ticket for both variants with server-driven
 * auto-daub state (ADR-20): marking is a pure function of the called set.
 * The same cells render 5×5 (75-ball, FREE centre) and 3×9 (90-ball strip).
 */
import { memo } from "react";
import { Star } from "lucide-react";
import { ballClass } from "@/lib/client/types";

interface Props {
  cells: (number | null)[][];
  variantId: string;
  called: Set<number>;
  freshBall: number | null;
  compact?: boolean;
}

export const BingoCard = memo(function BingoCard({ cells, variantId, called, freshBall, compact }: Props) {
  const is75 = variantId === "BALL_75";
  const cols = is75 ? 5 : 9;
  const headers = is75 ? ["B", "I", "N", "G", "O"] : Array.from({ length: 9 }, (_, i) => (i + 1).toString());

  return (
    <div className={`gold-frame rounded-xl bg-card/90 overflow-hidden ${compact ? "p-1.5" : "p-2.5"}`}>
      {/* Column headers */}
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {headers.map((h, i) => (
          <div key={`h-${i}`} className={`text-center font-black ${is75 ? "text-primary" : "text-muted-foreground/70 text-[9px]"}`}>
            {h}
          </div>
        ))}
      </div>
      {/* Grid */}
      {cells.map((row, r) => (
        <div key={r} className="grid gap-1 mb-1 last:mb-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {row.map((n, c) => {
            const isFree = n === null && is75 && r === 2 && c === 2;
            const marked = n !== null && called.has(n);
            const fresh = marked && n === freshBall;
            return (
              <div
                key={c}
                className={`relative flex items-center justify-center rounded-md select-none
                  ${compact ? "h-8 text-[13px]" : "h-10 text-[15px]"}
                  ${n === null
                    ? isFree
                      ? "bg-primary/15 text-primary"
                      : "bg-background/30"
                    : marked
                      ? "bg-background/25 text-transparent"
                      : "bg-secondary/70 text-foreground font-bold"}`}
                aria-label={n === null ? (isFree ? "free square" : "blank") : marked ? `${n} called` : String(n)}
              >
                {n === null ? (
                  isFree ? <Star className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} fill="currentColor" />
                  : <span className="text-muted-foreground/30 text-[10px]">·</span>
                ) : (
                  <>
                    <span className={marked ? "opacity-30" : ""}>{n}</span>
                    {marked && <span className={`daub ${fresh ? "" : "animate-none"}`} />}
                  </>
                )}
                {n !== null && marked && (
                  <span className={`absolute inset-0 flex items-center justify-center font-black text-white/95 ${compact ? "text-[13px]" : "text-[15px]"}`}>
                    {n}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});
