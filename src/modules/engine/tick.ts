/**
 * Draw tick — the hot path of a live round (UC-04, FR-GAME-04..08).
 *
 * One turn per room per tick, strictly sequential in-process (the ADR-01
 * single-threaded grain turn). Per turn:
 *   1. lazily materialise the deterministic ball sequence from the seal
 *      (crash-safe: the sequence is a pure function of committed inputs);
 *   2. if the room's ball interval has elapsed, persist the next BallDraw +
 *      emit BALL_CALLED on the outbox (ADR-19 sequence numbers);
 *   3. server-side auto-daub (ADR-20): evaluate every open pattern against
 *      every ticket in the room;
 *   4. any tier with completions pays NOW — split across simultaneous
 *      winners, floor each share (remainder stays in the round), journalised
 *      as one balanced PRIZE transaction, claims CONFIRMED (ADR-16), tier
 *      closes (later claims would be PATTERN_ALREADY_CONFIRMED);
 *   5. completion: all balls drawn or every tier paid → RESOLVING.
 */
import { db } from "../../lib/db";
import { emitOutbox, auditTx } from "../../lib/write-path";
import { generateDrawSequence, openSealedSeed } from "../game-core/draw";
import { gridSpec } from "../game-core/variants";
import { isPatternComplete } from "../game-core/patterns";
import { tierAmountFor } from "../prize/rulesets";
import { AccountCodes, postTransaction } from "../ledger";
import type { EngineRoomState } from "./state";
import { roomState } from "./state";
import { buildRoomState } from "./lifecycle";
import { finishRoom } from "./finish";

type RoomRow = Awaited<ReturnType<typeof db.room.findUniqueOrThrow>>;

/** Entry point for a DRAWING room; builds state on first sight (crash-safe). */
export async function tickDrawing(room: RoomRow): Promise<void> {
  let state = await roomStateOrBuild(room);

  if (!state.sequence) {
    const seal = await db.fairnessSeal.findUnique({ where: { roomId: room.id } });
    if (!seal) {
      // Defensive: a DRAWING room without a seal is a protocol violation —
      // send it to completion under the critical-fault path instead of drawing unbound balls.
      console.error(`[engine] ${room.title} DRAWING without seal — voiding`);
      await db.room.update({ where: { id: room.id }, data: { status: "RESOLVING" } });
      return;
    }
    const serverSeed = openSealedSeed(seal.serverSeedEnc);
    state.sequence = await generateDrawSequence(serverSeed, seal.salt, seal.clientSeedContribution, seal.nonce, room.variantId);
    await loadTickets(state);
  }

  const spec = gridSpec(room.variantId);
  if (state.drawnCount >= spec.ballsTotal) {
    await completeRound(room);
    return;
  }

  const last = await db.ballDraw.findFirst({ where: { roomId: room.id }, orderBy: { seq: "desc" } });
  const lastAt = last?.calledAt.getTime() ?? room.scheduledAt.getTime();
  if (Date.now() - lastAt < room.ballIntervalMs) return;

  const seq = state.drawnCount + 1;
  const ball = state.sequence[seq - 1];

  await db.$transaction(async (tx) => {
    await tx.ballDraw.create({ data: { roomId: room.id, seq, ball } });
    await emitOutbox(tx, {
      type: "BALL_CALLED",
      aggregateId: room.id,
      payload: { roomId: room.id, seq, ball },
      consumer: "gateway",
    });
  });
  state.drawnCount = seq;

  const called = new Set(state.sequence.slice(0, seq));
  await resolveAwards(state, room, seq, ball, called);

  if (seq >= spec.ballsTotal || (state.rules.length > 0 && state.closedRules.size >= state.rules.length)) {
    await completeRound(room);
  }
}

/** Entry point for a DRAWING room; builds state on first sight (crash-safe). */
async function roomStateOrBuild(room: RoomRow): Promise<EngineRoomState> {
  const existing = roomState(room.id);
  if (existing) return existing;
  return buildRoomState(room);
}

async function loadTickets(state: EngineRoomState): Promise<void> {
  const rows = await db.ticket.findMany({
    where: { roomId: state.roomId },
    select: { id: true, playerId: true, numbersJson: true },
  });
  state.tickets = new Map(
    rows.map((t) => {
      let cells: (number | null)[][] = [];
      try {
        cells = JSON.parse(t.numbersJson);
      } catch {
        cells = [];
      }
      return [t.id, { playerId: t.playerId, cells }];
    })
  );
}

/**
 * Auto-daub award resolution for one ball tick. Sequential per pattern;
 * each paying tier is exactly one balanced journal + one outbox event.
 */
async function resolveAwards(
  state: EngineRoomState,
  room: RoomRow,
  seq: number,
  ball: number,
  called: Set<number>
): Promise<void> {
  if (!state.tickets) return; // no sales — nothing to award

  for (const pattern of state.patterns) {
    if (state.closedRules.has(pattern.entityId)) continue;
    const rule = state.rules.find((r) => r.patternRef === pattern.entityId);
    if (!rule) continue;

    const winners: Array<{ ticketId: string; playerId: string }> = [];
    for (const [ticketId, t] of state.tickets) {
      if (t.cells.length === 0) continue;
      if (isPatternComplete(room.variantId, t.cells, called, pattern.payload).complete) {
        winners.push({ ticketId, playerId: t.playerId });
      }
    }
    if (winners.length === 0) continue;

    // Tier amounts always recompute from the room row (FR-PLY-02 live preview
    // equals engine maths — same function, same inputs).
    const fresh = await db.room.findUniqueOrThrow({ where: { id: room.id } });
    const tier = tierAmountFor(rule, fresh.grossSantim, fresh.netPoolSantim);
    // bigint division truncates toward zero = floor(tier / k): the remainder
    // of any uneven split stays in the round pool (residual).
    const each = tier > 0n ? tier / BigInt(winners.length) : 0n;
    const total = each * BigInt(winners.length);

    await db.$transaction(async (tx) => {
      const posted =
        total > 0n
          ? await postTransaction(tx, {
              kind: "PRIZE",
              idempotencyKey: `prize:${room.id}:${pattern.entityId}:${seq}`,
              memo: `Prize "${pattern.label}" — ${winners.length} winner(s), ball #${ball} @${seq}`,
              roundId: room.id,
              tenantId: room.tenantId,
              entries: [
                {
                  accountCode: AccountCodes.roundEscrow(room.id),
                  accountType: "LIABILITY" as const,
                  accountName: `Round escrow — ${room.title}`,
                  direction: "DEBIT",
                  amount: total,
                  tenantId: room.tenantId,
                },
                ...winners.map((w) => ({
                  accountCode: AccountCodes.playerWallet(w.playerId),
                  accountType: "LIABILITY" as const,
                  accountName: "Player wallet",
                  direction: "CREDIT" as const,
                  amount: each,
                  ownerUserId: w.playerId,
                })),
              ],
            })
          : null;

      for (const w of winners) {
        await tx.claim.create({
          data: {
            clientClaimId: `auto:${room.id}:${pattern.entityId}:${w.ticketId}`,
            roomId: room.id,
            ticketId: w.ticketId,
            playerId: w.playerId,
            patternVersionId: pattern.versionId,
            ballSeq: seq,
            status: "CONFIRMED",
            awardSantim: total > 0n ? each : null,
            journalTxId: posted?.id ?? null,
            decidedAt: new Date(),
          },
        });
      }

      if (total > 0n) {
        await tx.room.update({
          where: { id: room.id },
          data: { netPoolSantim: fresh.netPoolSantim - total },
        });
      }

      await emitOutbox(tx, {
        type: "AWARDS_RESOLVED",
        aggregateId: room.id,
        payload: {
          roomId: room.id,
          seq,
          ball,
          patternId: pattern.entityId,
          label: pattern.label,
          tier: tier.toString(),
          each: each.toString(),
          winners: winners.map((w) => ({ playerId: w.playerId, ticketId: w.ticketId, award: each.toString() })),
        },
        consumer: "gateway",
      });
      await auditTx(tx, {
        actorId: null,
        actorRole: "ENGINE",
        tenantId: room.tenantId,
        action: "AWARD_CONFIRMED",
        entityType: "Claim",
        entityId: `${room.id}:${pattern.entityId}:${seq}`,
        meta: { ball, seq, winners: winners.length, tier: tier.toString(), each: each.toString() },
      });
    });

    state.closedRules.add(pattern.entityId);
    console.log(`[engine] ${room.title} → "${pattern.label}" paid ball #${ball} @${seq} (${winners.length} winner(s))`);
  }
}

async function completeRound(room: RoomRow): Promise<void> {
  const current = await db.room.findUniqueOrThrow({ where: { id: room.id } });
  if (current.status === "DRAWING") {
    await db.room.update({ where: { id: room.id }, data: { status: "RESOLVING" } });
    await emitOutbox(db, {
      type: "ROOM_PHASE",
      aggregateId: room.id,
      payload: { roomId: room.id, status: "RESOLVING" },
      consumer: "gateway",
    });
  }
  await finishRoom(room.id);
}
