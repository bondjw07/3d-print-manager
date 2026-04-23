export type ProductImportSource = "THANGS" | "LOOT_STUDIOS" | "MY_MINI_FACTORY";

export type ProductImportFetchMode = "DIRECT_HTML" | "MIRROR_MARKDOWN";

export type ImportedProductData = {
  source: ProductImportSource;
  sourceUrl: string;
  sourceReferenceId?: string;
  creatorName?: string;
  creatorUrl?: string;
  title: string;
  shortDescription?: string;
  fullDescription?: string;
  category?: string;
  tags: string[];
  imageUrls: string[];
  fetchMode: ProductImportFetchMode;
};

export interface ProductUrlImporter {
  readonly source: ProductImportSource;
  supports(url: URL): boolean;
  importFromUrl(sourceUrl: string): Promise<ImportedProductData>;
}
