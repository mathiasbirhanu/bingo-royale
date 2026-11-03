"use client";

/** Shared client-side view models (mirrors API payloads). */

export interface RoomListItem {
  id: string;
  title: string;
  variantId: string;
  status: string;
  tenantId: string | null;
  priceSantim: string;
  maxCards: number;
  scheduledAt: string;
  salesOpenAt: string;
  players: number;
  tickets: number;
}

export interface PrizePreviewRow {
  patternId: string;
  patternLabel: string;
  awardType: string;
  tierSantim: string;
}

export interface RoomDetail {
  id: string;
  title: string;
  variantId: string;
  status: string;
  tenantId: string | null;
  priceSantim: string;
  maxCards: number;
  ballIntervalMs: number;
  autoClaim: boolean;
  scheduledAt: string;
  salesOpenAt: string;
  salesCloseAt: string;
  grossSantim: string;
  netPoolSantim: string;
  prizeTable: PrizePreviewRow[];
  myTickets: Array<{ ticketId: string; numbers: (number | null)[][] }>;
}

export interface WalletData {
  balanceSantim: string;
  balanceDisplay: string;
  currency: string;
  mode: string;
  phase: string;
  history: Array<{
    kind: string;
    memo: string;
    amountSantim: string;
    amountDisplay: string;
    createdAt: string;
    demo: boolean;
  }>;
}

export const ROOM_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Starting soon",
  SALES_OPEN: "Cards on sale",
  LOCKED: "Sales closed",
  DRAWING: "LIVE",
  RESOLVING: "Settling",
  COMPLETED: "Finished",
  VOIDED: "Voided",
};

export function ballClass(ball: number): string {
  const bucket = Math.ceil(ball / 15); // 1..5 decades → warm colourways
  return `ball-b${Math.min(5, Math.max(1, bucket))}`;
}
