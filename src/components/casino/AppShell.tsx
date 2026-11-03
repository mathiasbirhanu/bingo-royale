"use client";

/**
 * AppShell — gold header with live balance, connection banner, and the
 * thumb-reach bottom navigation (mobile-first casino layout). Sticky footer
 * posture: min-h flex column with mt-auto.
 */
import { ReactNode } from "react";
import { Dices, Wallet, History, ShieldHalf, Radio, Building2 } from "lucide-react";
import { useApp, canSeeAdmin, canSeePortal } from "@/lib/client/store";
import { usePhase } from "@/lib/phase";

function NavButton({ view, label, icon, active, onClick }: { view: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className={`transition-transform ${active ? "scale-110" : ""}`}>{icon}</span>
      {label}
      <span className={`h-0.5 w-6 rounded-full transition-all ${active ? "bg-primary" : "bg-transparent"}`} />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView, balanceDisplay, user, offline, openRoom, activeRoomId } = useApp();
  const phase = usePhase();
  const adminVisible = canSeeAdmin(user);
  const portalVisible = canSeePortal(user);

  return (
    <div className="casino-felt min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
          <button className="flex items-center gap-2 min-w-0" onClick={() => setView("lobby")} aria-label="Bingo Royale home">
            <span className="ball-sphere ball-b4 w-8 h-8 text-[15px]">B</span>
            <span className="gold-text font-black tracking-wide text-lg truncate">BINGO ROYALE</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest border border-accent/60 text-accent-foreground bg-accent/85 rounded-full px-2.5 py-1">
              {phase}
            </span>
            <button
              onClick={() => setView("wallet")}
              className="gold-frame flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-card/80"
              aria-label={`Balance ${balanceDisplay} birr — open wallet`}
            >
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">ETB</span>
              <span className="font-bold text-primary text-sm tabular-nums">{balanceDisplay}</span>
            </button>
          </div>
        </div>
        {offline && (
          <div className="slide-down bg-accent/90 text-accent-foreground text-xs text-center py-1.5 px-4">
            Unstable connection — syncing in the background, your game state is safe.
          </div>
        )}
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-4 pb-24">{children}</main>

      <footer className="mt-auto sticky bottom-0 z-40 border-t border-primary/20 bg-background/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <nav className="mx-auto max-w-3xl flex" aria-label="Main">
          <NavButton view="lobby" label="Lobby" icon={<Dices className="w-5 h-5" />} active={view === "lobby"} onClick={() => setView("lobby")} />
          <NavButton view="wallet" label="Wallet" icon={<Wallet className="w-5 h-5" />} active={view === "wallet"} onClick={() => setView("wallet")} />
          {view === "room" && (
            <NavButton view="room" label="Live" icon={<Radio className="w-5 h-5 live-dot" />} active onClick={() => activeRoomId && openRoom(activeRoomId)} />
          )}
          <NavButton view="history" label="History" icon={<History className="w-5 h-5" />} active={view === "history"} onClick={() => setView("history")} />
          {adminVisible && (
            <NavButton view="admin" label="Console" icon={<ShieldHalf className="w-5 h-5" />} active={view === "admin"} onClick={() => setView("admin")} />
          )}
          {portalVisible && (
            <NavButton view="portal" label="Portal" icon={<Building2 className="w-5 h-5" />} active={view === "portal"} onClick={() => setView("portal")} />
          )}
        </nav>
      </footer>
    </div>
  );
}
