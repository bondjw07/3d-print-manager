import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { applyFilamentWeightImport } from "@/server/services/filament-weight-import-service";

export const runtime = "nodejs";

const applyRequestSchema = z.object({
  rows: z
    .array(
      z.object({
        rowKey: z.string().trim().min(1),
        csvRowIndex: z.number().int().nonnegative(),
        csvModelName: z.string().trim().min(1),
        productId: z.string().trim().min(1),
        totalWeightGrams: z.number().positive().nullable().default(null),
        filamentAssignments: z
          .array(
            z.object({
              filamentId: z.string().trim().min(1),
              csvFilamentName: z.string().trim().min(1),
              grams: z.number().positive(),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

type ApplyRequestBody = z.infer<typeof applyRequestSchema>;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ApplyRequestBody;
  try {
    body = applyRequestSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await applyFilamentWeightImport(body.rows);
    revalidatePath("/admin/products");
    revalidatePath("/admin");
    revalidatePath("/admin/queue");
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply CSV updates.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
