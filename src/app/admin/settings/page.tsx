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
  applySourceMigrationRowsAction,
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
  scanThangsCreatorMigrationAction,
  importThangsCatalogCsvAction,
  setSourceMigrationRowTargetAction,
  updatePublicAppUrlAction,
  updateBambuBuddyBaseUrlAction,
  updateFileWorkflowLimitsAction,
  saveBambuBuddyApiKeyAction,
  importBambuBuddyFilamentMappingsAction,
  saveBambuBuddyFilamentMappingAction,
  updateDefaultFilamentSpoolCostAction,
  updateProductCategoriesAction,
  updatePricingTierAction,
  updateSettingsAction,
} from "@/server/actions/portal-actions";
import { ThangsEnrichedCsvImportForm } from "@/components/admin/thangs-enriched-csv-import-form";
import { getManagedCreators } from "@/server/services/creator-service";
import { getMyMiniFactoryIntegrationStatus } from "@/server/services/myminifactory-auth-service";
import { getShopifyIntegrationStatus } from "@/server/services/shopify-auth-service";
import { getProcessingEstimateSettings, getSettings } from "@/server/services/settings-service";
import { getPricingTiers } from "@/server/services/pricing-tier-service";
import { getShopifyCategoryTagMappings } from "@/server/services/shopify-category-tag-mapping-service";
import { getBuildVersion } from "@/lib/build-info";
import { getLatestSourceMigration } from "@/server/services/source-migration-service";
import { getBambuBuddyFilamentMappings } from "@/server/services/bambuddy-filament-mapping-service";
import { getP2sReference } from "@/server/services/p2s-reference-service";
import { referenceProfileNames } from "@/server/files/three-mf-processor";
import { P2sReferenceUpload } from "@/components/admin/p2s-reference-upload";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>;
}) {
  const [params, settings, processingSettings, myMiniFactoryStatus, shopifyStatus, creators, pricingTiers, shopifyCategoryMappings, latestSourceMigration, bambuBuddyMappings, p2sReference] = await Promise.all([
    searchParams,
    getSettings(),
    getProcessingEstimateSettings(),
    getMyMiniFactoryIntegrationStatus(),
    getShopifyIntegrationStatus(),
    getManagedCreators(),
    getPricingTiers(),
    getShopifyCategoryTagMappings(),
    getLatestSourceMigration(),
    getBambuBuddyFilamentMappings(),
    getP2sReference(),
  ]);
  const tab = ["catalog", "marketplace", "integrations", "operations"].includes(params.tab ?? "") ? params.tab! : "catalog";
  const tabClass = (name: string) => `rounded-t-xl px-4 py-2 text-sm font-medium ${tab === name ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`;
  const buildVersion = getBuildVersion();

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

      <Card className={tab === "integrations" ? "" : "hidden"}>
        <CardHeader>
          <CardTitle>BamBuddy</CardTitle>
          <CardDescription>Set the base URL used to import file details into products.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-xl gap-5">
            <form action={updateBambuBuddyBaseUrlAction} className="grid gap-3">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <label className="grid gap-1 text-sm font-medium text-slate-800">BamBuddy URL<Input name="bambuBuddyBaseUrl" type="url" defaultValue={settings.bambuBuddyBaseUrl ?? ""} placeholder="http://bambuddy.local" required /></label>
              <p className="text-xs text-slate-500">Use the address reachable by this app&apos;s server, without the API path.</p>
              <Button type="submit" className="w-fit">Save BamBuddy URL</Button>
            </form>
            <form action={saveBambuBuddyApiKeyAction} className="grid gap-3 border-t border-slate-200 pt-5">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <label className="grid gap-1 text-sm font-medium text-slate-800">API key<Input name="bambuBuddyApiKey" type="password" placeholder={settings.bambuBuddyApiKeyEncrypted ? "Configured — enter a new key to replace it" : "BamBuddy API key"} autoComplete="new-password" required /></label>
              <p className="text-xs text-slate-500">Stored encrypted and sent as the <code>X-API-Key</code> header when importing file data. {settings.bambuBuddyApiKeyEncrypted ? "An API key is configured." : "No API key is configured."}</p>
              <Button type="submit" className="w-fit">Save API Key</Button>
            </form>
            <form action={updateDefaultFilamentSpoolCostAction} className="grid gap-3 border-t border-slate-200 pt-5">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <label className="grid gap-1 text-sm font-medium text-slate-800">Default 1 kg spool cost<Input name="defaultFilamentSpoolCost" type="number" min="0" step="0.01" defaultValue={settings.defaultFilamentSpoolCost.toString()} required /></label>
              <p className="text-xs text-slate-500">Used to estimate material cost for products with BamBuddy requirements. Legacy filament costs remain only as a fallback for products that have not been imported.</p>
              <Button type="submit" className="w-fit">Save Default Spool Cost</Button>
            </form>
            <form action={updateFileWorkflowLimitsAction} className="grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <div className="md:col-span-2">
                <p className="font-medium text-slate-800">Product file safety limits</p>
                <p className="mt-1 text-xs text-slate-500">Applied to source packages, P2S references, processed files, and print-ready uploads.</p>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Maximum uploaded file (GiB)<Input name="fileUploadMaxGiB" type="number" min="0.05" max="100" step="0.05" defaultValue={Number(settings.fileUploadMaxBytes) / 1024 ** 3} required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Maximum expanded ZIP (GiB)<Input name="zipExpandedMaxGiB" type="number" min="0.05" max="500" step="0.05" defaultValue={Number(settings.zipExpandedMaxBytes) / 1024 ** 3} required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Maximum ZIP entries<Input name="zipMaxEntries" type="number" min="1" max="100000" step="1" defaultValue={settings.zipMaxEntries} required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Maximum compression ratio<Input name="zipMaxCompressionRatio" type="number" min="2" max="10000" step="1" defaultValue={settings.zipMaxCompressionRatio} required /></label>
              <div className="md:col-span-2"><Button type="submit" variant="secondary">Save File Limits</Button></div>
            </form>
            <div className="space-y-3 border-t border-slate-200 pt-5">
              <div>
                <p className="font-medium text-slate-800">P2S processing reference</p>
                <p className="mt-1 text-xs text-slate-500">Processing intentionally replaces the complete Bambu Studio project settings with this reference, then applies the reviewed colors and matching filament profiles.</p>
              </div>
              {p2sReference ? <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p><span className="font-medium text-slate-800">Current:</span> {p2sReference.originalName} · SHA-256 {p2sReference.sha256.slice(0, 12)}…</p>
                <p className="mt-1"><span className="font-medium text-slate-800">Detected profiles:</span> {referenceProfileNames((p2sReference.extractedSettings ?? {}) as Record<string, unknown>).join(", ") || "None"}</p>
              </div> : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No P2S reference configured. Product processing is blocked until one is uploaded.</p>}
              <P2sReferenceUpload />
            </div>
            <form action={importBambuBuddyFilamentMappingsAction} className="grid gap-3 border-t border-slate-200 pt-5">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <label className="grid gap-1 text-sm font-medium text-slate-800">Import color mappings CSV<Input name="mappingFile" type="file" accept="text/csv,.csv,application/json,.json" required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">BamBuddy material type (optional)<Input name="materialType" placeholder="PLA" /></label>
              <p className="text-xs text-slate-500">Use CSV columns Type, Sub Type, Color Name, and Hex Color. Rows are upserted by BamBuddy material type and hex color; subtype is retained as descriptive metadata.</p>
              <Button type="submit" className="w-fit" variant="secondary">Import Mappings</Button>
            </form>
            <form action={saveBambuBuddyFilamentMappingAction} className="grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/admin/settings?tab=integrations" />
              <label className="grid gap-1 text-sm font-medium text-slate-800">Material type<Input name="materialType" placeholder="PLA" required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Hex color<Input name="hexColor" placeholder="#A1B2C3" required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Display/color name<Input name="colorName" placeholder="Forest Green" required /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Manufacturer (optional)<Input name="manufacturer" /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Source material (optional)<Input name="materialName" /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">Material subtype / finish (optional)<Input name="effectType" placeholder="Matte" /></label>
              <div className="md:col-span-2"><Button type="submit" variant="secondary">Save Mapping</Button></div>
            </form>
            {bambuBuddyMappings.length > 0 ? <div className="border-t border-slate-200 pt-5 text-sm"><p className="mb-2 font-medium text-slate-800">Saved mappings ({bambuBuddyMappings.length})</p><div className="max-h-48 space-y-1 overflow-y-auto">{bambuBuddyMappings.map((mapping) => <p key={mapping.id} className="rounded bg-slate-50 px-2 py-1"><span className="font-medium">{mapping.materialType} {mapping.hexColor}</span> — {mapping.colorName}{mapping.effectType ? ` (${mapping.effectType})` : ""}</p>)}</div></div> : null}
          </div>
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
          <CardTitle>Deployed Commit</CardTitle>
          <CardDescription>This is the Git commit built into the running container. Match it to the commit you released to confirm that deployment is live.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">{buildVersion}</p>
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
          <CardTitle>Thangs Creator Migration</CardTitle>
          <CardDescription>
            Upload the saved Loot Lab and Kit Kiln catalog CSVs to build a one-time, reviewable migration. No Thangs server fetch is required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form action={scanThangsCreatorMigrationAction} className="grid gap-3 rounded-xl border border-border bg-surface-muted p-4 lg:grid-cols-3">
            <input type="hidden" name="redirectTo" value="/admin/settings?tab=operations" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Existing creator name
              <Input name="sourceCreator" defaultValue="The Loot Lab" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Existing creator URL (optional)
              <Input name="sourceCreatorUrl" type="url" defaultValue="https://thangs.com/designer/The%20Loot%20Lab" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Destination creator URL
              <Input name="targetCreatorUrl" type="url" defaultValue="https://thangs.com/designer/The%20Kit%20Kiln" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Loot Lab catalog CSV
              <Input name="sourceCsv" type="file" accept=".csv,text/csv" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Kit Kiln catalog CSV
              <Input name="targetCsv" type="file" accept=".csv,text/csv" required />
            </label>
            <div className="lg:col-span-3">
              <Button type="submit">Build CSV review</Button>
              <p className="mt-2 text-xs text-slate-600">Every imported Loot Lab product receives a fuzzy Kit Kiln proposal. Green is high confidence, yellow needs review, and red should be manually matched before applying.</p>
            </div>
          </form>

          <form action={importThangsCatalogCsvAction} className="grid gap-3 rounded-xl border border-border bg-surface-muted p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input type="hidden" name="redirectTo" value="/admin/settings?tab=operations" />
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Kit Kiln catalog CSV
              <Input name="catalogCsv" type="file" accept=".csv,text/csv" required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Creator URL
              <Input name="creatorUrl" type="url" defaultValue="https://thangs.com/designer/The%20Kit%20Kiln" required />
            </label>
            <div className="flex items-end"><Button type="submit">Import missing drafts</Button></div>
            <p className="lg:col-span-3 text-xs text-slate-600">Creates only missing Thangs IDs as non-public, non-listable drafts. It uses CSV title, ID, and URL only; images, descriptions, and print details remain for review.</p>
          </form>

          <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Chrome-enriched import</p>
            <p className="mt-1 text-xs text-slate-600">First download a queue of only missing models, run the Chrome Snippet against that queue, then upload its enriched CSV here.</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <form action="/api/admin/thangs-enrichment-queue" method="post" encType="multipart/form-data" className="flex items-end gap-2"><label className="grid flex-1 gap-1 text-xs font-medium">Kit Kiln catalog CSV<Input name="catalogCsv" type="file" accept=".csv,text/csv" required /></label><Button type="submit" variant="secondary">Download queue</Button></form>
              <ThangsEnrichedCsvImportForm />
            </div>
          </div>

          {latestSourceMigration ? (() => {
            const rows = latestSourceMigration.rows;
            const mappedRows = rows.filter((row) => Boolean(row.targetReferenceId && row.targetSourceUrl));
            const pendingMappedRows = mappedRows.filter((row) => row.status === "PENDING");
            const appliedRows = rows.filter((row) => row.status === "APPLIED");
            const conflictRows = rows.filter((row) => row.status === "CONFLICT");
            const greenRows = pendingMappedRows.filter((row) => (row.confidence ?? 0) >= 85).length;
            const yellowRows = pendingMappedRows.filter((row) => (row.confidence ?? 0) >= 60 && (row.confidence ?? 0) < 85).length;
            const redRows = pendingMappedRows.length - greenRows - yellowRows;
            return (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">Latest review: {latestSourceMigration.sourceCreator} → {latestSourceMigration.targetCreator}</p>
                    <p className="text-xs text-slate-500">Built {latestSourceMigration.scannedAt.toLocaleString()} · {rows.length} source products · <span className="text-emerald-700">{greenRows} green</span> · <span className="text-amber-700">{yellowRows} yellow</span> · <span className="text-rose-700">{redRows} red</span></p>
                  </div>
                  <a className="text-sm font-medium text-sky-700 hover:underline" href={latestSourceMigration.targetCreatorUrl} target="_blank" rel="noreferrer">Open destination creator</a>
                </div>
                {rows.length === 0 ? <p className="text-sm text-amber-700">No imported Thangs products matched this source creator. Check the creator name or add its stored creator URL.</p> : null}
                <div className="space-y-3">
                  <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                        <tr><th className="p-3">Apply</th><th className="p-3">Existing product</th><th className="p-3">Old Thangs ID</th><th className="p-3">Proposed Kit Kiln listing</th><th className="p-3">Result</th></tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const canApply = row.status === "PENDING" && Boolean(row.targetReferenceId && row.targetSourceUrl);
                          const confidenceTone = (row.confidence ?? 0) >= 85 ? "migration-confidence-green" : (row.confidence ?? 0) >= 60 ? "migration-confidence-yellow" : "migration-confidence-red";
                          return <tr key={row.id} className="border-t border-slate-200 align-top">
                            <td className="p-3"><input form="apply-source-migration" type="checkbox" name="rowIds" value={row.id} disabled={!canApply} aria-label={`Apply ${row.productTitle}`} /></td>
                            <td className="p-3"><a className="font-medium text-sky-700 hover:underline" href={`/admin/products/${row.productId}`}>{row.productTitle}</a>{row.oldSourceUrl ? <a className="mt-1 block text-xs text-slate-500 hover:underline" href={row.oldSourceUrl} target="_blank" rel="noreferrer">Open old listing</a> : null}</td>
                            <td className="p-3 font-mono text-xs text-slate-600">{row.oldReferenceId ?? "—"}</td>
                            <td className="p-3">{row.targetSourceUrl ? <><a className="font-medium text-sky-700 hover:underline" href={row.targetSourceUrl} target="_blank" rel="noreferrer">{row.targetTitle}</a><p className="mt-1 font-mono text-xs text-slate-600">{row.targetReferenceId}</p></> : <span className="text-rose-700">No candidate</span>}<details className="mt-2"><summary className="cursor-pointer text-xs text-sky-700">Set manual match</summary><form action={setSourceMigrationRowTargetAction} className="mt-2 flex gap-2"><input type="hidden" name="redirectTo" value="/admin/settings?tab=operations" /><input type="hidden" name="migrationId" value={latestSourceMigration.id} /><input type="hidden" name="rowId" value={row.id} /><Select name="targetId" defaultValue={latestSourceMigration.targets.find((target) => target.referenceId === row.targetReferenceId)?.id ?? ""} className="h-8 min-w-0 flex-1 text-xs"><option value="" disabled>Choose a Kit Kiln listing</option>{latestSourceMigration.targets.map((target) => <option key={target.id} value={target.id}>{target.title} — {target.referenceId}</option>)}</Select><Button type="submit" size="sm" variant="secondary" disabled={latestSourceMigration.targets.length === 0}>Save</Button></form>{latestSourceMigration.targets.length === 0 ? <p className="mt-1 text-xs text-amber-700">Upload the CSVs again to populate the target list.</p> : null}</details></td>
                            <td className="p-3 text-xs">{row.status === "APPLIED" ? <span className="font-medium text-emerald-700">Applied {row.appliedAt?.toLocaleString()}</span> : row.status === "CONFLICT" ? <span className="text-rose-700">{row.error ?? "Conflict"}</span> : <span className={`inline-flex rounded-full border px-2 py-1 font-medium ${confidenceTone}`}>{row.matchMethod === "Manual URL" ? "Manual match" : `${row.confidence ?? 0}% ${row.matchMethod ?? "candidate"}`}</span>}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                  <form id="apply-source-migration" action={applySourceMigrationRowsAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="redirectTo" value="/admin/settings?tab=operations" />
                    <input type="hidden" name="migrationId" value={latestSourceMigration.id} />
                    <ConfirmSubmitModalButton variant="primary" confirmTitle="Apply selected Thangs mappings?" confirmMessage="This updates only the selected products’ source ID and URL to the Kit Kiln listing. Product content, images, inventory, listings, and requests are not changed." confirmLabel="Apply selected mappings" disabled={pendingMappedRows.length === 0}>Apply selected mappings</ConfirmSubmitModalButton>
                    <span className="text-xs text-slate-500">{pendingMappedRows.length} pending mappings; {appliedRows.length} applied; {conflictRows.length} conflict{conflictRows.length === 1 ? "" : "s"}.</span>
                  </form>
                </div>
              </div>
            );
          })() : <p className="text-sm text-slate-500">No migration scan yet.</p>}
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
            <p className="text-sm font-semibold text-rose-800">Delete Legacy Local Filaments</p>
            <p className="mt-1 text-sm text-slate-600">
              Permanently deletes legacy local-filament data and linked legacy product requirements. BamBuddy mappings and requirements are not affected. This action cannot be undone.
            </p>
            <form action={deleteAllFilamentsAction} className="mt-3">
              <input type="hidden" name="redirectTo" value="/admin/settings" />
              <ConfirmSubmitModalButton
                variant="danger"
                confirmTitle="Delete Legacy Local Filaments?"
                confirmMessage="This will permanently delete every legacy local filament and its linked legacy product requirements. BamBuddy data is not affected. This cannot be undone."
                confirmLabel="Yes, Delete Legacy Filaments"
                confirmationKeyword="delete"
                confirmationInputName="confirmWord"
              >
                Delete Legacy Local Filaments
              </ConfirmSubmitModalButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
