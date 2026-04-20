export type ListingContentSuggestion = {
  title: string;
  description: string;
  tags: string[];
};

export interface ListingContentProvider {
  generateListingContent(input: {
    productName: string;
    category: string;
    shortDescription: string;
    tags: string[];
  }): Promise<ListingContentSuggestion>;
}
