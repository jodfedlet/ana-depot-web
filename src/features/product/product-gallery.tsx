"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { useRef } from "react";
import { useT } from "@/i18n/provider";
import type { ProductImage } from "@/lib/catalog-types";
import { cn } from "@/lib/cn";

export function ProductGallery({ images, index, onIndexChange }: { images: ProductImage[]; index: number; onIndexChange: (i: number) => void }) {
  const t = useT();
  const touchStart = useRef<number | null>(null);
  const count = images.length;
  const go = (i: number) => onIndexChange((i + count) % count);
  const current = images[index] ?? images[0];

  return (
    <div className="lg:sticky lg:top-40 lg:self-start">
      <div
        className="relative aspect-square overflow-hidden rounded-card bg-sand-100"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current === null || count < 2) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          touchStart.current = null;
        }}
      >
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          sizes="(min-width:1024px) 55vw, 100vw"
          loading="eager"
          fetchPriority="high"
          className="object-cover"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} aria-label={t("product.prevImage")} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow-card hover:bg-surface">
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label={t("product.nextImage")} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow-card hover:bg-surface">
              <ChevronRight aria-hidden className="size-5" />
            </button>
            <p className="text-caption absolute bottom-2 right-2 rounded-full bg-surface/90 px-2.5 py-0.5 font-medium tabular-nums" role="status">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>
      {count > 1 && (
        <ul aria-label={t("product.images")} className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <li key={img.src} className="shrink-0">
              <button
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={t("product.showImage", { n: i + 1, total: count })}
                aria-current={i === index ? "true" : undefined}
                className={cn("relative block size-16 overflow-hidden rounded-control border-2 bg-sand-100 sm:size-20", i === index ? "border-brand-700" : "border-transparent hover:border-line-strong")}
              >
                <Image src={img.src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
