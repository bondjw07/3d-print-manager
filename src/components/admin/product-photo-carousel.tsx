"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductPhotoCarouselImage = {
  id: string;
  imagePath: string;
  altText: string | null;
  isPrimary: boolean;
};

function getInitialImageIndex(images: ProductPhotoCarouselImage[]) {
  const primaryImageIndex = images.findIndex((image) => image.isPrimary);
  return primaryImageIndex >= 0 ? primaryImageIndex : 0;
}

export function ProductPhotoCarousel({
  images,
  productName,
}: {
  images: ProductPhotoCarouselImage[];
  productName: string;
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(() => getInitialImageIndex(images));
  const imageCount = images.length;

  if (imageCount === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No product images yet.
      </div>
    );
  }

  const selectedImage = images[selectedImageIndex] ?? images[0];

  const showNextImage = () => {
    setSelectedImageIndex((currentIndex) => (currentIndex + 1) % imageCount);
  };

  const showPreviousImage = () => {
    setSelectedImageIndex((currentIndex) => (currentIndex - 1 + imageCount) % imageCount);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div className="relative h-60 max-h-[50vh] w-full sm:h-72 lg:h-80">
          <Image
            src={selectedImage.imagePath}
            alt={selectedImage.altText ?? productName}
            fill
            sizes="(max-width: 639px) calc(100vw - 3rem), 576px"
            className="object-contain"
          />
        </div>

        {imageCount > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="pointer-events-auto h-8 w-8 rounded-full p-0"
              aria-label="Show previous product photo"
              onClick={showPreviousImage}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="pointer-events-auto h-8 w-8 rounded-full p-0"
              aria-label="Show next product photo"
              onClick={showNextImage}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}

        <p className="absolute bottom-2 right-2 rounded-md bg-slate-900/70 px-2 py-1 text-xs font-medium text-white">
          {selectedImageIndex + 1} / {imageCount}
        </p>
      </div>

      {imageCount > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={cn(
                "relative h-14 w-16 shrink-0 overflow-hidden rounded-lg border bg-slate-100",
                selectedImageIndex === index
                  ? "border-sky-400 ring-2 ring-sky-100"
                  : "border-slate-200 hover:border-slate-300",
              )}
              aria-label={`Show product photo ${index + 1}`}
              onClick={() => setSelectedImageIndex(index)}
            >
              <Image
                src={image.imagePath}
                alt={image.altText ?? `${productName} photo ${index + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
