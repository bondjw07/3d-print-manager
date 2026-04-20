import Link from "next/link";
import { MetricCard } from "@/components/layout/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableContainer } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { humanizeEnum } from "@/lib/domain";
import { getDashboardSummary } from "@/server/services/dashboard-service";

export default async function AdminDashboardPage() {
  const summary = await getDashboardSummary();

  return (
    <div className="space-y-5">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Operations Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">3D Print Operations Overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Real-time visibility into requests, queue execution, marketplace sync, and inventory pressure points.
        </p>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending Requests" value={summary.pendingRequests} helper="Submitted and under review" />
        <MetricCard
          label="Listings Needing Review"
          value={summary.listingsNeedingReview}
          helper="OUT_OF_SYNC or NEEDS_REVIEW"
        />
        <MetricCard
          label="Active Queue Jobs"
          value={
            summary.queueByStatus.PENDING +
            summary.queueByStatus.READY_TO_PRINT +
            summary.queueByStatus.PRINTING +
            summary.queueByStatus.POST_PROCESSING +
            summary.queueByStatus.BLOCKED
          }
          helper="Jobs currently in production flow"
        />
        <MetricCard label="Low Stock Alerts" value={summary.lowStockItems.length} helper="Based on available vs threshold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Queue By Status</CardTitle>
            <Link href="/admin/queue">
              <Button size="sm" variant="secondary">
                Open Queue
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {Object.entries(summary.queueByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{humanizeEnum(status)}</span>
                <span className="text-sm font-semibold text-slate-900">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Low Inventory Alerts</CardTitle>
            <Link href="/admin/inventory">
              <Button size="sm" variant="secondary">
                Manage Inventory
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.lowStockItems.length === 0 ? (
              <p className="text-sm text-slate-500">No low-stock alerts right now.</p>
            ) : (
              summary.lowStockItems.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-sm text-slate-800">{item.product.publicName}</span>
                  <span className="text-xs font-medium text-amber-700">
                    {item.available} available / threshold {item.reorderThreshold}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Marketplace Events</CardTitle>
            <Link href="/admin/listings">
              <Button size="sm" variant="secondary">
                Listings & Events
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Event</th>
                    <th className="px-2 py-2">Marketplace</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentEvents.map((event) => (
                    <tr key={event.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-700">{humanizeEnum(event.eventType)}</td>
                      <td className="px-2 py-2 text-sm text-slate-700">{humanizeEnum(event.marketplaceType)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge value={event.processingStatus} />
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Queue Items</CardTitle>
            <Link href="/admin/queue">
              <Button size="sm" variant="secondary">
                Queue Details
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentQueue.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-700">{item.product.publicName}</td>
                      <td className="px-2 py-2 text-sm text-slate-700">{humanizeEnum(item.sourceType)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
