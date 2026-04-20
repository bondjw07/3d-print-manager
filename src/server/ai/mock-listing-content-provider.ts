import { type ListingContentProvider } from "./listing-content-provider";

export class MockListingContentProvider implements ListingContentProvider {
  async generateListingContent(input: {
    productName: string;
    category: string;
    shortDescription: string;
    tags: string[];
  }) {
    return {
      title: `${input.productName} | Premium ${input.category} Print`,
      description: `${input.shortDescription} Crafted in-house with quality-controlled print profiles and careful post-processing for consistent results.`,
      tags: Array.from(new Set(["3dprint", "madeinhouse", ...input.tags])).slice(0, 12),
    };
  }
}

export const mockListingContentProvider = new MockListingContentProvider();
