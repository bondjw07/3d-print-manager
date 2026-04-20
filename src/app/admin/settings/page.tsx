import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { marketplaceTypeOptions, humanizeEnum } from "@/lib/domain";
import {
  disconnectMyMiniFactoryOAuthAction,
  updateMyMiniFactoryCredentialsAction,
  updateSettingsAction,
} from "@/server/actions/portal-actions";
import { getMyMiniFactoryIntegrationStatus } from "@/server/services/myminifactory-auth-service";
import { getSettings } from "@/server/services/settings-service";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, settings, myMiniFactoryStatus] = await Promise.all([
    searchParams,
    getSettings(),
    getMyMiniFactoryIntegrationStatus(),
  ]);

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
          <p>Auth provider: local credential session with role-based access controls (ready for provider swap).</p>
          <p>Marketplace provider: mocked adapter behind interface with publish/update/remove/refresh actions.</p>
          <p>AI provider: mocked listing content interface stub available for future model integration.</p>
          <p>Storage provider: local filesystem adapter for product images, abstracted for future object storage.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MyMiniFactory OAuth</CardTitle>
          <CardDescription>
            Configure OAuth credentials for creator bulk import. Credentials are hashed and encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p>
              Credentials configured:{" "}
              <span className="font-semibold text-slate-900">{myMiniFactoryStatus.hasCredentials ? "Yes" : "No"}</span>
            </p>
            <p>
              OAuth connected:{" "}
              <span className="font-semibold text-slate-900">{myMiniFactoryStatus.hasAccessToken ? "Yes" : "No"}</span>
            </p>
            <p>
              Token status:{" "}
              <span className="font-semibold text-slate-900">
                {myMiniFactoryStatus.hasAccessToken
                  ? myMiniFactoryStatus.isAccessTokenExpired
                    ? "Expired"
                    : "Active"
                  : "Not connected"}
              </span>
            </p>
            {myMiniFactoryStatus.tokenExpiresAt ? (
              <p>
                Token expiry:{" "}
                <span className="font-semibold text-slate-900">
                  {myMiniFactoryStatus.tokenExpiresAt.toLocaleString()}
                </span>
              </p>
            ) : null}
            {myMiniFactoryStatus.connectedAt ? (
              <p>
                Last connected:{" "}
                <span className="font-semibold text-slate-900">{myMiniFactoryStatus.connectedAt.toLocaleString()}</span>
              </p>
            ) : null}
          </div>

          <form action={updateMyMiniFactoryCredentialsAction} className="grid max-w-xl gap-3">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Client ID
              <Input
                name="myMiniFactoryClientId"
                type="text"
                autoComplete="off"
                placeholder="MMF OAuth client_id"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Client Secret
              <Input
                name="myMiniFactoryClientSecret"
                type="password"
                autoComplete="new-password"
                placeholder="MMF OAuth client_secret"
                required
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="w-fit">
                Save Credentials
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <form action="/api/admin/myminifactory/oauth/connect" method="get">
              <Button type="submit" disabled={!myMiniFactoryStatus.hasCredentials}>
                Connect OAuth
              </Button>
            </form>

            <form action={disconnectMyMiniFactoryOAuthAction}>
              <input type="hidden" name="redirectTo" value="/admin/settings" />
              <Button type="submit" variant="secondary" disabled={!myMiniFactoryStatus.hasAccessToken}>
                Disconnect OAuth
              </Button>
            </form>
          </div>

          <p className="text-xs text-slate-500">
            OAuth callback path: <code>/api/admin/myminifactory/oauth/callback</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
