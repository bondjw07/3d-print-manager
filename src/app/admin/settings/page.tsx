import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitModalButton } from "@/components/ui/confirm-submit-modal-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { marketplaceTypeOptions, humanizeEnum, shopifyCategoryTagOptions } from "@/lib/domain";
import {
  baselineGramsPerHourOptions,
  complexityMultiplierOptions,
  fixedHoursPerPrintOptions,
  printerUtilizationRateOptions,
} from "@/lib/processing-time-estimates";
import {
  createManagedCreatorAction,
  createPricingTierAction,
  deletePricingTierAction,
  deleteManagedCreatorAction,
  deleteAllFilamentsAction,
  deleteAllProductsAction,
  disconnectMyMiniFactoryOAuthAction,
  updateProcessingEstimateSettingsAction,
  updateManagedCreatorAction,
  updateMyMiniFactoryCredentialsAction,
  saveShopifyCredentialsAction,
  saveShopifyCategoryTagMappingAction,
  testShopifyConnectionAction,
  updatePublicAppUrlAction,
  updateProductCategoriesAction,
  updatePricingTierAction,
  updateSettingsAction,
} from "@/server/actions/portal-actions";
import { getManagedCreators } from "@/server/services/creator-service";
import { getMyMiniFactoryIntegrationStatus } from "@/server/services/myminifactory-auth-service";
import { getShopifyIntegrationStatus } from "@/server/services/shopify-auth-service";
import { getProcessingEstimateSettings, getSettings } from "@/server/services/settings-service";
import { getPricingTiers } from "@/server/services/pricing-tier-service";
import { getShopifyCategoryTagMappings } from "@/server/services/shopify-category-tag-mapping-service";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>;
}) {
  const [params, settings, processingSettings, myMiniFactoryStatus, shopifyStatus, creators, pricingTiers, shopifyCategoryMappings] = await Promise.all([
    searchParams,
    getSettings(),
    getProcessingEstimateSettings(),
    getMyMiniFactoryIntegrationStatus(),
    getShopifyIntegrationStatus(),
    getManagedCreators(),
    getPricingTiers(),
    getShopifyCategoryTagMappings(),
  ]);
  const tab = ["catalog", "marketplace", "integrations", "operations"].includes(params.tab ?? "") ? params.tab! : "catalog";
  const tabClass = (name: string) => `rounded-t-xl px-4 py-2 text-sm font-medium ${tab === name ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`;

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

      <div className="flex gap-2 border-b border-slate-200">
        <a href="/admin/settings?tab=catalog" className={tabClass("catalog")}>Catalog & pricing</a>
        <a href="/admin/settings?tab=marketplace" className={tabClass("marketplace")}>Marketplace</a>
        <a href="/admin/settings?tab=integrations" className={tabClass("integrations")}>Integrations</a>
        <a href="/admin/settings?tab=operations" className={tabClass("operations")}>Operations</a>
      </div>

      <Card className={tab === "marketplace" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Public App URL</CardTitle>
          <CardDescription>Used by Shopify to retrieve selected product images during listing creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePublicAppUrlAction} className="grid max-w-xl gap-3">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">Public HTTPS URL<Input name="publicAppUrl" type="url" defaultValue={settings.publicAppUrl ?? ""} placeholder="https://print.example.com" required /></label>
            <p className="text-xs text-slate-500">This domain must be publicly reachable over HTTPS so Shopify can download product images.</p>
            <Button type="submit" className="w-fit">Save Public URL</Button>
          </form>
        </CardContent>
      </Card>

      <Card className={tab === "marketplace" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Shopify Admin API</CardTitle>
          <CardDescription>
            Connect your own Shopify store with a Dev Dashboard app. Credentials are encrypted at rest and access tokens are requested server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p>Credentials configured: <span className="font-semibold text-slate-900">{shopifyStatus.hasCredentials ? "Yes" : "No"}</span></p>
            <p>Store: <span className="font-semibold text-slate-900">{shopifyStatus.shopName ?? shopifyStatus.shopDomain ?? "Not connected"}</span></p>
            {shopifyStatus.connectedAt ? <p>Last verified: <span className="font-semibold text-slate-900">{shopifyStatus.connectedAt.toLocaleString()}</span></p> : null}
            {shopifyStatus.scope ? <p className="mt-2 break-words text-xs">Granted scopes: {shopifyStatus.scope}</p> : null}
          </div>
          <form action={saveShopifyCredentialsAction} className="grid max-w-xl gap-3">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">Shopify store domain<Input name="shopifyShopDomain" defaultValue={shopifyStatus.shopDomain ?? ""} placeholder="your-store.myshopify.com" autoComplete="off" required /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">Client ID<Input name="shopifyClientId" placeholder="Shopify app client ID" autoComplete="off" required /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">Client secret<Input name="shopifyClientSecret" type="password" placeholder="Shopify app client secret" autoComplete="new-password" required /></label>
            <Button type="submit" className="w-fit">Save Shopify Credentials</Button>
          </form>
          <form action={testShopifyConnectionAction}>
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <Button type="submit" variant="secondary" disabled={!shopifyStatus.hasCredentials}>Test Connection</Button>
          </form>
          <p className="text-xs text-slate-500">In Shopify Dev Dashboard, create and install an app for this store, then grant <code>read_products</code>, <code>write_products</code>, <code>read_publications</code>, and <code>write_publications</code> before using listing sync.</p>
        </CardContent>
      </Card>

      <Card className={tab === "marketplace" ? "" : "hidden"}>
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

      <Card className={tab === "marketplace" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Shopify Category Tag Mappings</CardTitle>
          <CardDescription>Choose which Shopify tag should be preselected when listing products from each catalog category.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {settings.productCategories.map((category) => {
            const currentTag = shopifyCategoryMappings.find((mapping) => mapping.category === category)?.categoryTag ?? "";
            return <form action={saveShopifyCategoryTagMappingAction} key={category} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=marketplace" />
              <input type="hidden" name="category" value={category} />
              <p className="pt-2 text-sm font-medium text-slate-700">{category}</p>
              <Select name="categoryTag" defaultValue={currentTag}><option value="">No default tag</option>{shopifyCategoryTagOptions.map((option) => <option key={option.tag} value={option.tag}>{option.label}</option>)}</Select>
              <Button type="submit" variant="secondary">Save</Button>
            </form>;
          })}
        </CardContent>
      </Card>

      <Card className={tab === "catalog" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Product Categories</CardTitle>
          <CardDescription>Define the category choices used by product forms and bulk updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProductCategoriesAction} className="grid max-w-2xl gap-3">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">Categories<Textarea name="categories" defaultValue={settings.productCategories.join("\n")} placeholder={"Props & Replicas\nCollectible Figures\nGaming Miniatures"} /></label>
            <p className="text-xs text-slate-500">Enter one category per line or separate them with commas. Product categories are selected from this list, not entered free-form.</p>
            <Button type="submit" className="w-fit">Save Product Categories</Button>
          </form>
        </CardContent>
      </Card>

      <Card className={tab === "catalog" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Pricing Tiers</CardTitle>
          <CardDescription>Set the category-specific pricing choices available on products. The selected tier pre-fills a new listing price and can still be overridden per listing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createPricingTierAction} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto]">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">Category<Select name="category" required defaultValue=""><option value="" disabled>Select category</option>{settings.productCategories.map((category) => <option key={category} value={category}>{category}</option>)}</Select></label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">Tier label<Input name="label" placeholder="Small — Dagger" required /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">Suggested price<Input name="suggestedPrice" type="number" min={0.01} step="0.01" placeholder="0.00" required /></label>
            <div className="flex items-end"><Button type="submit">Add tier</Button></div>
          </form>

          {pricingTiers.length === 0 ? <p className="text-sm text-slate-500">Add a tier for each category you want to price consistently.</p> : <div className="space-y-3">
            {pricingTiers.map((tier) => <div key={tier.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[180px_minmax(0,1fr)_140px_auto_auto]">
              <form action={updatePricingTierAction} className="contents">
                <input type="hidden" name="redirectTo" value="/admin/settings" />
                <input type="hidden" name="id" value={tier.id} />
                <p className="pt-2 text-sm font-medium text-slate-600">{tier.category}</p>
                <label className="grid gap-1 text-sm font-medium text-slate-800"><span className="sr-only">Tier label</span><Input name="label" defaultValue={tier.label} required /></label>
                <label className="grid gap-1 text-sm font-medium text-slate-800"><span className="sr-only">Suggested price</span><Input name="suggestedPrice" type="number" min={0.01} step="0.01" defaultValue={tier.suggestedPrice.toString()} required /></label>
                <div className="flex items-end"><Button type="submit" variant="secondary">Save</Button></div>
              </form>
              <form action={deletePricingTierAction} className="flex items-end">
                <input type="hidden" name="redirectTo" value="/admin/settings" />
                <input type="hidden" name="id" value={tier.id} />
                <ConfirmSubmitModalButton variant="danger" confirmTitle="Delete pricing tier?" confirmMessage={`Products using “${tier.label}” will lose their tier, but their existing listing prices will not change.`} confirmLabel="Delete">Delete</ConfirmSubmitModalButton>
              </form>
            </div>)}
          </div>}
        </CardContent>
      </Card>

      <Card className={tab === "operations" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Print Time Estimation</CardTitle>
          <CardDescription>
            Controls rough production-time estimates shown on queue and request lists. These values tune machine-time
            plus per-print overhead, then convert to calendar time using printer count and utilization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProcessingEstimateSettingsAction} className="grid max-w-3xl gap-4">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor="printerCount">
                Number of printers
                <Input
                  id="printerCount"
                  name="printerCount"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={processingSettings.printerCount}
                  required
                />
                <span className="text-xs font-normal text-slate-500">
                  Used to convert total machine-hours into wall-clock finish time.
                </span>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor="printerUtilizationRate">
                Printer utilization
                <Select
                  id="printerUtilizationRate"
                  name="printerUtilizationRate"
                  defaultValue={processingSettings.printerUtilizationRate.toString()}
                >
                  {printerUtilizationRateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs font-normal text-slate-500">
                  Real-world uptime allowance for downtime, operator availability, and interruptions.
                </span>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor="baselineGramsPerHour">
                Baseline throughput
                <Select
                  id="baselineGramsPerHour"
                  name="baselineGramsPerHour"
                  defaultValue={processingSettings.baselineGramsPerHour.toString()}
                >
                  {baselineGramsPerHourOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs font-normal text-slate-500">
                  Rough grams-per-hour conversion before complexity and overhead are applied.
                </span>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor="complexityMultiplier">
                Complexity multiplier
                <Select
                  id="complexityMultiplier"
                  name="complexityMultiplier"
                  defaultValue={processingSettings.complexityMultiplier.toString()}
                >
                  {complexityMultiplierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs font-normal text-slate-500">
                  Applies extra time for support-heavy, slower, or reliability-focused print profiles.
                </span>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-800 sm:col-span-2" htmlFor="fixedHoursPerPrint">
                Fixed overhead per print
                <Select
                  id="fixedHoursPerPrint"
                  name="fixedHoursPerPrint"
                  defaultValue={processingSettings.fixedHoursPerPrint.toString()}
                >
                  {fixedHoursPerPrintOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs font-normal text-slate-500">
                  Non-printing time per unit for setup, prep, unloading, and cleanup.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p>Formula: ((total grams / grams-per-hour) × complexity multiplier) + (quantity × overhead hours).</p>
              <p className="mt-1">
                Calendar finish estimate: machine-hours / (printer count × utilization).
              </p>
            </div>

            <Button type="submit" className="w-fit">
              Save Time Estimation Settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={tab === "integrations" ? "" : "hidden"}>
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

      <Card className={tab === "catalog" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>Managed Creators</CardTitle>
          <CardDescription>
            Maintain a shared creator list for product forms and bulk updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createManagedCreatorAction} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input type="hidden" name="redirectTo" value="/admin/settings" />
            <Input name="name" placeholder="Creator name (e.g. Loot Lab)" required />
            <Input name="url" type="url" placeholder="Creator URL (optional)" />
            <Button type="submit">Add Creator</Button>
          </form>

          {creators.length === 0 ? (
            <p className="text-sm text-slate-500">No creators added yet.</p>
          ) : (
            <div className="space-y-2">
              {creators.map((creator) => (
                <div key={creator.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <form action={updateManagedCreatorAction} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                    <input type="hidden" name="redirectTo" value="/admin/settings" />
                    <input type="hidden" name="creatorId" value={creator.id} />
                    <Input name="name" defaultValue={creator.name} required />
                    <Input name="url" type="url" defaultValue={creator.url ?? ""} placeholder="Creator URL (optional)" />
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                    <Button
                      type="submit"
                      formAction={deleteManagedCreatorAction}
                      formNoValidate
                      variant="ghost"
                      className="text-rose-700 hover:text-rose-800"
                    >
                      Delete
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={tab === "integrations" ? "" : "hidden"}>
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

      <Card className={tab === "operations" ? "border-rose-200" : "hidden border-rose-200"}>
        <CardHeader>
          <CardTitle className="text-rose-700">Bulk Operations (Danger Zone)</CardTitle>
          <CardDescription className="text-rose-700">
            These operations are destructive and cannot be reversed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="text-sm font-semibold text-rose-800">Delete All Products</p>
            <p className="mt-1 text-sm text-slate-600">
              Permanently deletes all products and removes linked queue items and requests. This action cannot be undone.
            </p>
            <form action={deleteAllProductsAction} className="mt-3">
              <input type="hidden" name="redirectTo" value="/admin/settings" />
              <ConfirmSubmitModalButton
                variant="danger"
                confirmTitle="Delete All Products?"
                confirmMessage="This will permanently delete every product in the system and remove linked queue/request records. This cannot be undone."
                confirmLabel="Yes, Delete Everything"
                confirmationKeyword="delete"
                confirmationInputName="confirmWord"
              >
                Delete All Products
              </ConfirmSubmitModalButton>
            </form>
          </div>

          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="text-sm font-semibold text-rose-800">Delete All Filaments</p>
            <p className="mt-1 text-sm text-slate-600">
              Permanently deletes all filaments and removes linked product filament requirements. This action cannot be undone.
            </p>
            <form action={deleteAllFilamentsAction} className="mt-3">
              <input type="hidden" name="redirectTo" value="/admin/settings" />
              <ConfirmSubmitModalButton
                variant="danger"
                confirmTitle="Delete All Filaments?"
                confirmMessage="This will permanently delete every filament and remove all linked product filament requirements. This cannot be undone."
                confirmLabel="Yes, Delete Filaments"
                confirmationKeyword="delete"
                confirmationInputName="confirmWord"
              >
                Delete All Filaments
              </ConfirmSubmitModalButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
