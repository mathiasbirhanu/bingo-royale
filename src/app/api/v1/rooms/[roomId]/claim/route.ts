import { z } from "zod";
import { jsonOk, route } from "@/lib/api";
import { claimPrize } from "@/modules/engine/claim";

/**
 * Player BINGO! claim (UC-04, manual rooms autoClaim=false).
 *
 * POST /api/v1/rooms/[roomId]/claim  { daubs?: [{ ticketId, numbers }] }
 *   → { claimed, label, eachSantim, ... }
 *
 * Manual play is honest: the caller sends the numbers they tapped PER CARD
 * (tapping one card never marks another). The server intersects every daub
 * with the CALLED-ball set and requires the claimed card's pattern cells to
 * be actually daubed — uncalled marks count for nothing, and the tier still
 * splits across every ticket in the room completing it at this ball. Not-yet
 * claims return ok:true with claimed:false + a friendly "n more for X" hint
 * instead of an error, so a rushed tap is never punished hard.
 */
const schema = z.object({
  daubs: z
    .array(
      z.object({
        ticketId: z.string().min(1).max(64),
        numbers: z.array(z.number().int().min(1).max(90)).max(30),
      })
    )
    .max(12)
    .optional(),
});

export const POST = route(
  async ({ params, body, user }) => {
    const input = schema.parse(body ?? {});
    const outcome = await claimPrize(params.roomId, user!.id, input.daubs ?? []);
    return jsonOk(outcome);
  },
  { schema }
);
