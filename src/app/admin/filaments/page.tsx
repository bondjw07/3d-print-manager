import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createFilamentAction } from "@/server/actions/portal-actions";
import { getFilaments } from "@/server/services/filament-service";

export default async function AdminFilamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string }>;
}) {
  const [params, allFilaments] = await Promise.all([searchParams, getFilaments(true)]);
  const query = params.q?.trim().toLowerCase() ?? "";

  const filaments = query
    ? allFilaments.filter((filament) => {
        const haystack = `${filament.name} ${filament.brand ?? ""} ${filament.colorLabel} ${filament.materialType}`.toLowerCase();
        return haystack.includes(query);
      })
    : allFilaments;

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Filaments</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Filament Catalog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Controlled filament inventory used for product planning and queue aggregation.
        </p>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Filament</CardTitle>
          <CardDescription>Add a controlled filament option for product requirements.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createFilamentAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="redirectTo" value="/admin/filaments" />
            <Input name="name" placeholder="Name" required />
            <Input name="brand" placeholder="Brand (optional)" />
            <Input name="colorLabel" placeholder="Color label" required />
            <Input name="materialType" placeholder="Material type (PLA, PETG...)" required />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isActive">
                Active
              </label>
              <Select id="isActive" name="isActive" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Textarea name="notes" placeholder="Notes" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create Filament</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Filaments</CardTitle>
          <CardDescription>Click a row to open the dedicated filament edit screen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/filaments" method="get" className="flex gap-2">
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by name, brand, color, or material"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Material</th>
                  <th className="px-2 py-2">Color</th>
                  <th className="px-2 py-2">Brand</th>
                  <th className="px-2 py-2">Usage</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {filaments.map((filament) => (
                  <tr key={filament.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-2 py-3">
                      <Link href={`/admin/filaments/${filament.id}`} className="font-medium text-slate-900 hover:underline">
                        {filament.name}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-sm text-slate-700">{filament.materialType}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">{filament.colorLabel}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">{filament.brand || "-"}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">
                      {filament.productRequirements.length} products
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge value={filament.isActive ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link href={`/admin/filaments/${filament.id}`}>
                        <Button size="sm" variant="secondary">
                          Edit
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {filaments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-10 text-center text-sm text-slate-500">
                      No filaments found for this search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
