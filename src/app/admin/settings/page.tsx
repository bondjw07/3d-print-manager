import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { marketplaceTypeOptions, humanizeEnum } from "@/lib/domain";
import { updateSettingsAction } from "@/server/actions/portal-actions";
import { getSettings } from "@/server/services/settings-service";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, getSettings()]);

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Portal Configuration</h1>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Default Marketplace</CardTitle>
          <CardDescription>
            Controls Buy button behavior for public products. A Buy button appears only when the product has a published
            listing with URL on this marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateSettingsAction} className="grid max-w-md gap-3">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <Select name="defaultMarketplace" defaultValue={settings.defaultMarketplace}>
              {marketplaceTypeOptions.map((marketplace) => (
                <option key={marketplace} value={marketplace}>
                  {humanizeEnum(marketplace)}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-fit">
              Save Settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>Auth provider: mocked role-based session (ready for provider swap).</p>
          <p>Marketplace provider: mocked adapter behind interface with publish/update/remove/refresh actions.</p>
          <p>AI provider: mocked listing content interface stub available for future model integration.</p>
          <p>Storage provider: local filesystem adapter for product images, abstracted for future object storage.</p>
        </CardContent>
      </Card>
    </div>
  );
}
