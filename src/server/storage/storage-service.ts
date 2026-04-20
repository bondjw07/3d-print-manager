export type SavedProductImage = {
  imagePath: string;
  fileName: string;
};

export interface ProductImageStorage {
  saveProductImage(file: File): Promise<SavedProductImage>;
  deleteProductImage(imagePath: string): Promise<void>;
}
