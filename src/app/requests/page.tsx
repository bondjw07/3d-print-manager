import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { isKitKilnModel } from "@/lib/request-scale";
import { requireRole } from "@/server/auth/mock-auth-provider";
import { deleteOwnRequestAction, updateOwnRequestAction } from "@/server/actions/portal-actions";
import { getRequestsForUser } from "@/server/services/request-service";

const fallbackModelIcon = "/seed-images/geometric-planter-1.svg";

function formatScalePercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (Math.abs(numeric - Math.round(numeric)) < 0.001) {
    return `${Math.round(numeric)}%`;
  }

  return `${numeric.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [user, params] = await Promise.all([requireRole(["REQUEST_USER", "ADMIN"]), searchParams]);
  const requests = await getRequestsForUser(user.id);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>View and manage your print requests in one place.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {params.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}
          {params.success ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {params.success}
            </p>
          ) : null}

          {requests.length === 0 ? (
            <EmptyState title="No requests yet" description="Use the catalog to submit your first request." />
          ) : (
            <>
              <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(0,2fr)_auto_auto_7rem_11rem_minmax(0,2fr)_auto] lg:items-center lg:gap-3">
                <p>Model</p>
                <p>Status</p>
                <p>Submitted</p>
                <p>Quantity</p>
                <p>Scale</p>
                <p>Comments</p>
                <p className="text-right">Actions</p>
              </div>

              <div className="space-y-2">
                {requests.map((request) => {
                  const primaryImage = request.product.images[0]?.imagePath ?? fallbackModelIcon;
                  const canEdit = request.status === "SUBMITTED";
                  const isKitKilnProduct = isKitKilnModel(request.product);
                  const modelScalePercent = Number(request.modelScalePercent);
                  const editableModelScaleValue = Math.abs(modelScalePercent - 75) < 0.001 ? "75" : "100";

                  return (
                    <form
                      key={request.id}
                      action={updateOwnRequestAction}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 lg:grid-cols-[minmax(0,2fr)_auto_auto_7rem_11rem_minmax(0,2fr)_auto] lg:items-center"
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="redirectTo" value="/requests" />
                      {!isKitKilnProduct ? <input type="hidden" name="modelScalePercent" value="100" /> : null}

                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          <Image src={primaryImage} alt={request.product.publicName} fill sizes="48px" className="object-cover" />
                        </div>
                        <p className="truncate text-sm font-medium text-slate-900">{request.product.publicName}</p>
                      </div>

                      <div className="justify-self-start lg:justify-self-center">
                        <StatusBadge value={request.status} />
                      </div>

                      <p className="text-xs text-slate-600">{formatDateTime(request.createdAt)}</p>

                      <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500 lg:sr-only" htmlFor={`quantity-${request.id}`}>
                          Quantity
                        </label>
                        <Input
                          id={`quantity-${request.id}`}
                          name="quantity"
                          type="number"
                          min={1}
                          max={50}
                          defaultValue={request.quantity}
                          disabled={!canEdit}
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          className="text-xs font-medium uppercase tracking-wide text-slate-500 lg:sr-only"
                          htmlFor={`scale-${request.id}`}
                        >
                          Scale
                        </label>
                        {isKitKilnProduct && canEdit ? (
                          <Select id={`scale-${request.id}`} name="modelScalePercent" defaultValue={editableModelScaleValue}>
                            <option value="100">100%</option>
                            <option value="75">75% (uses 50% filament)</option>
                          </Select>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <p>Model: {formatScalePercent(request.modelScalePercent)}</p>
                            <p>Filament: {formatScalePercent(request.filamentScalePercent)}</p>
                          </div>
                        )}
                        {isKitKilnProduct && canEdit ? (
                          <p className="text-[11px] text-slate-500">
                            Filament defaults to 50% when 75% model scale is selected.
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500 lg:sr-only" htmlFor={`notes-${request.id}`}>
                          Comments
                        </label>
                        <Input
                          id={`notes-${request.id}`}
                          name="notes"
                          defaultValue={request.notes ?? ""}
                          placeholder="Optional comments"
                          disabled={!canEdit}
                        />
                        {request.adminNotes ? <p className="text-xs text-emerald-700">Admin: {request.adminNotes}</p> : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {canEdit ? (
                          <>
                            <Button type="submit" size="sm" variant="secondary">
                              Save
                            </Button>
                            <Button type="submit" formAction={deleteOwnRequestAction} size="sm" variant="danger">
                              Delete
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Only submitted requests can be edited.</p>
                        )}
                      </div>
                    </form>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
