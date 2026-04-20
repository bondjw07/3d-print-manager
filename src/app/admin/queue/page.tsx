import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  type QueuePriority,
  type QueueSourceType,
  type QueueStatus,
} from "@/generated/prisma/enums";
import {
  humanizeEnum,
  queuePriorityOptions,
  queueSourceTypeOptions,
  queueStatusOptions,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { createQueueItemAction, updateQueueItemAction } from "@/server/actions/portal-actions";
import { getFilamentDemandSummary, getQueueItems } from "@/server/services/queue-service";

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sourceType?: string; priority?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;

  const statusFilter =
    params.status && queueStatusOptions.includes(params.status as QueueStatus)
      ? (params.status as QueueStatus)
      : undefined;
  const sourceFilter =
    params.sourceType && queueSourceTypeOptions.includes(params.sourceType as QueueSourceType)
      ? (params.sourceType as QueueSourceType)
      : undefined;
  const priorityFilter =
    params.priority && queuePriorityOptions.includes(params.priority as QueuePriority)
      ? (params.priority as QueuePriority)
      : undefined;

  const [queueItems, filamentSummary, products, users] = await Promise.all([
    getQueueItems({ status: statusFilter, sourceType: sourceFilter, priority: priorityFilter }),
    getFilamentDemandSummary(),
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { publicName: "asc" } }),
    prisma.user.findMany({ where: { role: "REQUEST_USER", isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Queue</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Print Queue Management</h1>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Queue Item</CardTitle>
            <CardDescription>Add manual, restock, or external work to the print queue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createQueueItemAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/admin/queue" />
              <Select name="productId" defaultValue="" required>
                <option value="" disabled>
                  Select product
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.publicName}
                  </option>
                ))}
              </Select>
              <Select name="sourceType" defaultValue="MANUAL">
                {queueSourceTypeOptions.map((source) => (
                  <option key={source} value={source}>
                    {humanizeEnum(source)}
                  </option>
                ))}
              </Select>
              <Input name="sourceReferenceId" placeholder="Source reference id" />
              <Select name="requesterUserId" defaultValue="">
                <option value="">No requester</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <Input type="number" name="quantity" defaultValue={1} min={1} required />
              <Select name="priority" defaultValue="NORMAL">
                {queuePriorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {humanizeEnum(priority)}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue="PENDING">
                {queueStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {humanizeEnum(status)}
                  </option>
                ))}
              </Select>
              <Input type="datetime-local" name="dueDate" />
              <Textarea name="notes" className="sm:col-span-2" placeholder="Operational notes" />
              <div className="sm:col-span-2">
                <Button type="submit">Create Queue Item</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filament Demand Summary</CardTitle>
            <CardDescription>Aggregated filament requirements across active queue work.</CardDescription>
          </CardHeader>
          <CardContent>
            {filamentSummary.length === 0 ? (
              <p className="text-sm text-slate-500">No active filament demand in queue.</p>
            ) : (
              <div className="space-y-2">
                {filamentSummary.map((item) => (
                  <div key={item.filamentId} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900">{item.filamentName}</p>
                      <p className="text-xs text-slate-500">{item.materialType}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>{item.totalEstimatedGrams.toFixed(1)}g estimated</span>
                      <span>{item.totalUnits} units</span>
                      <span>{item.queueItemCount} queue items</span>
                      {item.missingGramEstimates > 0 ? <span>{item.missingGramEstimates} units w/o gram estimate</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/queue" method="get" className="grid gap-2 sm:grid-cols-3">
            <Select name="status" defaultValue={params.status ?? ""}>
              <option value="">All statuses</option>
              {queueStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <Select name="sourceType" defaultValue={params.sourceType ?? ""}>
              <option value="">All sources</option>
              {queueSourceTypeOptions.map((source) => (
                <option key={source} value={source}>
                  {humanizeEnum(source)}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Select name="priority" defaultValue={params.priority ?? ""}>
                <option value="">All priorities</option>
                {queuePriorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {humanizeEnum(priority)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Filter
              </Button>
            </div>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Status / Priority</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Update</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">{item.product.publicName}</p>
                      <p className="text-xs text-slate-500">Created {formatDateTime(item.createdAt)}</p>
                    </td>
                    <td className="px-2 py-3 text-sm text-slate-700">{humanizeEnum(item.sourceType)}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">{item.quantity}</td>
                    <td className="px-2 py-3">
                      <div className="space-y-1">
                        <StatusBadge value={item.status} />
                        <StatusBadge value={item.priority} />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-500">{formatDateTime(item.dueDate)}</td>
                    <td className="px-2 py-3">
                      <form action={updateQueueItemAction} className="grid gap-2">
                        <input type="hidden" name="queueItemId" value={item.id} />
                        <input type="hidden" name="redirectTo" value="/admin/queue" />
                        <Select name="status" defaultValue={item.status}>
                          {queueStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {humanizeEnum(status)}
                            </option>
                          ))}
                        </Select>
                        <Select name="priority" defaultValue={item.priority}>
                          {queuePriorityOptions.map((priority) => (
                            <option key={priority} value={priority}>
                              {humanizeEnum(priority)}
                            </option>
                          ))}
                        </Select>
                        <Textarea name="notes" defaultValue={item.notes ?? ""} placeholder="Notes" />
                        <Button type="submit" size="sm" variant="secondary">
                          Save
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
