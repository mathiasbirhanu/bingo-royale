/**
 * Manual BINGO! claim tests — the pure decision core of engine/claim.ts:
 *   · pickClaim pays the first OPEN pattern the caller completed (ruleset order);
 *   · the caller must have DAUBED every pattern cell on the card they claim
 *     with — per-card daubs, uncalled marks count for nothing (server truth);
 *   · the tier then splits across EVERY ticket in the room completing it;
 *   · closed tiers never pay twice; ROLLED-UP tiers (window expired unclaimed)
 *     never pay at all — the owner's roll-up rule;
 *   · "n more for X" best-hint when nothing completes;
 *   · the claim window ladder (patternWindowSeq) and the manual-round
 *     completion grace window (shouldCompleteRound).
 */
import { describe, expect, test } from "bun:test";
import { pickClaim, patternRemaining, type ClaimDaub } from "../src/modules/engine/claim";
import { shouldCompleteRound } from "../src/modules/engine/tick";
import { PatternFactory, patternWindowSeq, type PatternPayload } from "../src/modules/game-core/patterns";

const CALLER = "player-A";
const OTHER = "player-B";

function cells75(): (number | null)[][] {
  // 5×5 with 1..25 laid row-wise, centre (2,2) free.
  const grid: (number | null)[][] = [];
  let n = 1;
  for (let r = 0; r < 5; r++) {
    const row: (number | null)[] = [];
    for (let c = 0; c < 5; c++) row.push(n++);
    grid.push(row);
  }
  grid[2][2] = null;
  return grid;
}

/** Daub every card number that is in `called` — the honest client behaviour. */
function daubCalled(cells: (number | null)[][], called: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const row of cells) for (const n of row) if (n !== null && called.has(n)) out.add(n);
  return out;
}

interface Def { entityId: string; versionId: string; label: string; payload: PatternPayload; }
const def = (id: string, payload: PatternPayload, label = id): Def => ({ entityId: id, versionId: `v-${id}`, label, payload });

function baseInput(overrides: Partial<Parameters<typeof pickClaim>[0]> = {}): Parameters<typeof pickClaim>[0] {
  const called = overrides.called ?? new Set([1, 2, 3, 4, 5]);
  return {
    variantId: "BALL_75",
    rules: [{ patternRef: "topline" }],
    patterns: [def("topline", PatternFactory.row75(0), "Top Line")],
    closedRules: new Set<string>(),
    myTickets: [{ ticketId: "t-A", cells: cells75(), daubed: daubCalled(cells75(), called) }],
    allTickets: [{ ticketId: "t-A", playerId: CALLER, cells: cells75() }],
    called,
    ...overrides,
  };
}

describe("pickClaim", () => {
  test("complete tier → caller wins, splits with every completing ticket", () => {
    const otherTicket = cells75();
    const res = pickClaim(baseInput({ allTickets: [{ ticketId: "t-A", playerId: CALLER, cells: cells75() }, { ticketId: "t-B", playerId: OTHER, cells: otherTicket }] }));
    if (!res.pattern) throw new Error("expected claimable");
    expect(res.pattern.entityId).toBe("topline");
    expect(res.winners.length).toBe(2);
    expect(res.winners.map((w) => w.playerId).sort()).toEqual([CALLER, OTHER].sort());
  });

  test("one number short → NOT_YET with honest remaining hint", () => {
    const res = pickClaim(baseInput({ called: new Set([1, 2, 3, 4]) }));
    expect(res.pattern).toBeNull();
    expect(res.pattern === null && res.best).toEqual({ label: "Top Line", remaining: 1 });
  });

  test("caller did not complete → other players' completions are NOT claimed by them", () => {
    // Caller holds a card with a different row; another player completed the line.
    const mine = cells75().map((row, r) => (r === 0 ? [51, 52, 53, 54, 55] : row));
    const res = pickClaim(baseInput({ myTickets: [{ ticketId: "t-A", cells: mine, daubed: daubCalled(mine, new Set([1, 2, 3, 4, 5])) }] }));
    expect(res.pattern).toBeNull();
  });

  test("closed tier is skipped; next open pattern pays", () => {
    const res = pickClaim(
      baseInput({
        rules: [{ patternRef: "topline" }, { patternRef: "corners" }],
        patterns: [def("topline", PatternFactory.row75(0), "Top Line"), def("corners", PatternFactory.fourCorners75(), "Four Corners")],
        closedRules: new Set(["topline"]),
        called: new Set([1, 5, 21, 25]), // corners complete (1,5,21,25), topline also complete but closed
      })
    );
    if (!res.pattern) throw new Error("expected corners claimable");
    expect(res.pattern.entityId).toBe("corners");
  });

  test("rolled-up tier never pays (window expired unclaimed — roll-up rule)", () => {
    const res = pickClaim(
      baseInput({
        rules: [{ patternRef: "topline" }],
        patterns: [def("topline", PatternFactory.row75(0), "Top Line")],
        rolledRules: new Set(["topline"]),
        called: new Set([1, 2, 3, 4, 5]),
      })
    );
    expect(res.pattern).toBeNull();
  });

  test("per-card daubs: tier does NOT pay unless the caller daubed every pattern cell", () => {
    // Called covers the top line, but the caller only tapped 1,2,3 on THIS card.
    const res = pickClaim(
      baseInput({
        myTickets: [{ ticketId: "t-A", cells: cells75(), daubed: new Set([1, 2, 3]) }],
      })
    );
    expect(res.pattern).toBeNull();
    expect(res.pattern === null && res.best).toEqual({ label: "Top Line", remaining: 2 });
  });

  test("uncalled daubs count for nothing (server truth — no fake marks)", () => {
    const daubed = new Set([1, 2, 3, 4, 5, 99]); // 99 was never called
    const res = pickClaim(baseInput({ myTickets: [{ ticketId: "t-A", cells: cells75(), daubed }] }));
    // Top line still pays — the valid daubs cover it; the fake mark is ignored.
    if (!res.pattern) throw new Error("expected claimable with valid daubs");
    expect(res.pattern.entityId).toBe("topline");
  });

  test("daubs are PER CARD: card B's daubs cannot win card A's tier", () => {
    // Caller holds two cards; only card B is fully daubed — card A misses the line.
    const res = pickClaim(
      baseInput({
        myTickets: [
          { ticketId: "t-A", cells: cells75(), daubed: new Set([1, 2, 3]) }, // short
          { ticketId: "t-B", cells: cells75(), daubed: daubCalled(cells75(), new Set([1, 2, 3, 4, 5])) },
        ],
      })
    );
    // Card B completed it honestly → the tier pays (best card wins).
    if (!res.pattern) throw new Error("expected card B's daubs to win");
    expect(res.pattern.entityId).toBe("topline");
    // …but a caller with ONLY the short card cannot claim on card B's marks:
    const solo = pickClaim(baseInput({ myTickets: [{ ticketId: "t-A", cells: cells75(), daubed: new Set([1, 2, 3]) }] }));
    expect(solo.pattern).toBeNull();
  });

  test("patternRemaining: CELLS / ROWS_MIN / FULL_HOUSE", () => {
    const cells = cells75();
    expect(patternRemaining("BALL_75", cells, new Set([1, 2, 3, 4]), PatternFactory.row75(0))).toBe(1);
    expect(patternRemaining("BALL_75", cells, new Set([1, 2, 3, 4, 5]), PatternFactory.row75(0))).toBe(0);
    // Free centre completes the X — need the 8 outer X cells.
    const x = PatternFactory.x75();
    if (x.kind !== "CELLS") throw new Error("X pattern must be CELLS");
    const xNumbers = x.cells.map(([r, c]) => cells[r][c] as number);
    const four = new Set<number>(xNumbers.slice(0, 4));
    expect(patternRemaining("BALL_75", cells, four, x)).toBe(xNumbers.length - 4);
    expect(patternRemaining("BALL_75", cells, new Set([1]), PatternFactory.blackout75())).toBe(23);
  });

  test("patternRemaining with daub marks: free square completes the X even un-daubed", () => {
    const cells = cells75(); // centre (2,2) free
    const x = PatternFactory.x75();
    if (x.kind !== "CELLS") throw new Error("X pattern must be CELLS");
    const xNumbers = x.cells.map(([r, c]) => cells[r][c] as number);
    // All 8 outer X numbers daubed (and called) → remaining 0 via the free square.
    const all = new Set<number>(xNumbers);
    expect(patternRemaining("BALL_75", cells, all, x, all)).toBe(0);
    // Marked set missing one outer cell → 1 remaining even though called covers all.
    const seven = new Set<number>(xNumbers.slice(1));
    expect(patternRemaining("BALL_75", cells, all, x, seven)).toBe(1);
  });
});

describe("patternWindowSeq (roll-up ladder)", () => {
  test("75-ball, 4 tiers → 19/38/56/75; the last tier never expires", () => {
    expect(patternWindowSeq(75, 0, 4)).toBe(19);
    expect(patternWindowSeq(75, 1, 4)).toBe(38);
    expect(patternWindowSeq(75, 2, 4)).toBe(56);
    expect(patternWindowSeq(75, 3, 4)).toBe(75);
  });
  test("90-ball, 3 tiers → 30/60/90", () => {
    expect(patternWindowSeq(90, 0, 3)).toBe(30);
    expect(patternWindowSeq(90, 1, 3)).toBe(60);
    expect(patternWindowSeq(90, 2, 3)).toBe(90);
  });
  test("degenerate inputs never expire", () => {
    expect(patternWindowSeq(75, 0, 1)).toBe(75);
    expect(patternWindowSeq(75, 0, 0)).toBe(75);
  });
});

describe("shouldCompleteRound (manual grace)", () => {
  const last = Date.now() - 5_000;
  test("all tiers settled → complete immediately, even mid-deck", () => {
    expect(shouldCompleteRound({ allBallsDrawn: false, allTiersSettled: true, autoClaim: true, lastBallCalledAt: last, now: Date.now() })).toBe(true);
    expect(shouldCompleteRound({ allBallsDrawn: false, allTiersSettled: true, autoClaim: false, lastBallCalledAt: last, now: Date.now() })).toBe(true);
  });
  test("auto room: last ball → complete now", () => {
    expect(shouldCompleteRound({ allBallsDrawn: true, allTiersSettled: false, autoClaim: true, lastBallCalledAt: last, now: Date.now() })).toBe(true);
  });
  test("manual room: last ball waits the grace window for late BINGO! claims", () => {
    expect(shouldCompleteRound({ allBallsDrawn: true, allTiersSettled: false, autoClaim: false, lastBallCalledAt: last, now: Date.now() })).toBe(false);
    expect(
      shouldCompleteRound({ allBallsDrawn: true, allTiersSettled: false, autoClaim: false, lastBallCalledAt: Date.now() - 21_000, now: Date.now() })
    ).toBe(true);
  });
  test("balls still in the drum → keep drawing", () => {
    expect(shouldCompleteRound({ allBallsDrawn: false, allTiersSettled: false, autoClaim: false, lastBallCalledAt: last, now: Date.now() })).toBe(false);
  });
});

/** Type-level smoke: the claim payload shape the client sends. */
const _payloadType: ClaimDaub[] = [{ ticketId: "t-A", numbers: [1, 2, 3] }];
void _payloadType;
