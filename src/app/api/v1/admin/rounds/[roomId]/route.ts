import { z } from "zod";
import { jsonOk, route, ROLE } from "@/lib/api";
import { db } from "@/lib/db";
import { voidRound } from "@/modules/rooms/void";
import { persistRoundReport } from "@/modules/reporting";

/**
 * Round actions from the console (UC-09, FR-ROOM-04, FR-ADM-05).
 * POST { action: "void", reasonCode } → void + one reversing entry per
 * purchase (idempotent `refund:{purchaseId}`); void during DRAWING demands
 * the CRITICAL_FAULT reason. Completed rounds get their report persisted
 * here so the report page can render reveal data (FR-GAME-07).
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("void"), reasonCode: z.string().min(3).max(64) }),
]);

export const POST = route(
  async ({ params, body, user }) => {
    const input = bodySchema.parse(body);
    const result = await voidRound(params.roomId, input.reasonCode, user!.id);
    const room = await db.room.findUniqueOrThrow({ where: { id: params.roomId } });
    if (room.status === "COMPLETED") {
      // Ensure the round report (with fairness reveal) exists for the viewer.
      const existing = await db.roundReport.findUnique({ where: { roomId: params.roomId } });
      if (!existing) {
        await persistRoundReport(params.roomId);
      }
    }
    return jsonOk({
      alreadyVoided: result.alreadyVoided,
      refundCount: result.refundCount,
      refundedSantim: result.refundedSantim.toString(),
      status: room.status,
    });
  },
  { roles: [ROLE.ADMIN, ROLE.SUPERVISOR], schema: bodySchema }
);

export const GET = route(
  async ({ params }) => {
    const room = await db.room.findUniqueOrThrow({ where: { id: params.roomId } });
    const report = await db.roundReport.findUnique({ where: { roomId: params.roomId } });
    return jsonOk({
      id: room.id,
      title: room.title,
      status: room.status,
      variantId: room.variantId,
      grossSantim: room.grossSantim.toString(),
      voidReason: room.voidReason,
      report: report ? JSON.parse(report.payloadJson) : null,
    });
  },
  { roles: [ROLE.ADMIN, ROLE.SUPERVISOR, ROLE.AUDITOR] }
);
