import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProcessingQueueWorkbench } from "@/components/admin/processing-queue-workbench";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DismissibleDetails } from "@/components/ui/dismissible-details";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getProcessingQueue, getProcessingQueueFacets } from "@/server/services/processing-queue-service";

type QueueSearchParams = {
  q?: string;
  category?: string;
  tag?: string;
  completion?: string;
  source?: string;
  state?: string;
  page?: string;
};

export default async function ProcessingQueuePage({ searchParams }: { searchParams: Promise<QueueSearchParams> }) {
  const params = await searchParams;
  const completion: "incomplete" | "complete" | "all" = params.completion === "complete" || params.completion === "all" ? params.completion : "incomplete";
  const source: "present" | "missing" | "all" = params.source === "present" || params.source === "missing" ? params.source : "all";
  const filters = {
    q: params.q?.trim() || undefined,
    category: params.category?.trim() || undefined,
    tag: params.tag?.trim() || undefined,
    completion,
    source,
    state: params.state?.trim() || undefined,
    page: Math.max(1, Number(params.page) || 1),
  };
  const [queue, facets] = await Promise.all([getProcessingQueue(filters), getProcessingQueueFacets()]);
  const activeFilterCount = [
    filters.completion !== "incomplete",
    filters.source !== "all",
    filters.state,
    filters.category,
    filters.tag,
  ].filter(Boolean).length;
  const clearFiltersHref = `/admin/products/processing?${new URLSearchParams(filters.q ? { q: filters.q } : {})}`;
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, page: String(page) })) if (value) query.set(key, value);
    return `/admin/products/processing?${query}`;
  };

  return <div className="space-y-4">
    <PageHeader>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Products</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Processing Queue</h1>
        <p className="mt-1 text-sm text-slate-600">Stage files, monitor machine work, and process Products by their next required action.</p>
      </div>
    </PageHeader>

    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex gap-2 border-b border-slate-200">
          <Link href="/admin/products" className="rounded-t-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Product catalog</Link>
          <Link href="/admin/products?view=bulk" className="rounded-t-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Bulk update</Link>
          <Link href="/admin/products?view=imports" className="rounded-t-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Imports</Link>
          <Link href="/admin/products/processing" className="rounded-t-xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950">Processing Queue</Link>
        </div>

        <form action="/admin/products/processing" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-64 flex-1" name="q" defaultValue={filters.q ?? ""} placeholder="Search Product name or SKU" />
            <DismissibleDetails className="group relative">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </summary>
              <div className="absolute right-0 z-10 mt-2 grid w-72 gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:w-96 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">Completion
                  <Select name="completion" defaultValue={filters.completion}>
                    <option value="incomplete">Incomplete</option><option value="complete">Complete</option><option value="all">All</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">Processing state
                  <Select name="state" defaultValue={filters.state ?? ""}>
                    <option value="">All processing states</option>
                    <option value="NEEDS_SOURCE">1 · Needs Source</option><option value="PROCESSING_SOURCE">2 · Processing Source</option>
                    <option value="NEEDS_MAPPING_REVIEW">3 · Mapping Review</option><option value="PROCESSED_READY">4 · Processed Ready</option>
                    <option value="NEEDS_UPDATED_PRINT_READY">5 · Updated Print-Ready</option><option value="READY_TO_PUBLISH">6 · Ready to Publish</option>
                    <option value="NEEDS_PRINT_READY">4/5 · Needs Print-Ready</option>
                    <option value="PUBLISHED">7 · Published</option><option value="ATTENTION">Attention</option><option value="ERROR">Errors</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">Source files
                  <Select name="source" defaultValue={filters.source}>
                    <option value="all">All source states</option><option value="missing">Source missing</option><option value="present">Source present</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">Category
                  <Select name="category" defaultValue={filters.category ?? ""}>
                    <option value="">All categories</option>{facets.categories.map((category) => <option key={category}>{category}</option>)}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">Tag
                  <Select name="tag" defaultValue={filters.tag ?? ""}>
                    <option value="">All tags</option>{facets.tags.map((tag) => <option key={tag}>{tag}</option>)}
                  </Select>
                </label>
                <div className="flex items-end justify-end gap-2">
                  {activeFilterCount > 0 ? <Link href={clearFiltersHref} className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Clear</Link> : null}
                  <Button type="submit" size="sm">Apply filters</Button>
                </div>
              </div>
            </DismissibleDetails>
            <Button type="submit" variant="secondary">Search</Button>
          </div>
        </form>

        <ProcessingQueueWorkbench initialRows={queue.rows} stateCounts={queue.stateCounts} />

        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>{queue.total} Product{queue.total === 1 ? "" : "s"} · Page {queue.page} of {queue.pageCount}</span>
          <div className="flex gap-2">
            {queue.page > 1 ? <Link href={pageHref(queue.page - 1)}><Button size="sm" variant="secondary">Previous</Button></Link> : null}
            {queue.page < queue.pageCount ? <Link href={pageHref(queue.page + 1)}><Button size="sm" variant="secondary">Next</Button></Link> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  </div>;
}
