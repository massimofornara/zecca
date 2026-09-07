import Image from "next/image";
import { cn } from "@/lib/utils";
import { PRODUCT_ART } from "@/lib/catalog";

const PHOTO_KEYS = new Set<string>(PRODUCT_ART);

export function productPhotoSrc(imageKey: string) {
  return PHOTO_KEYS.has(imageKey) ? `/products/${imageKey}.webp` : null;
}

export function ProductArt({
  imageKey,
  className,
  alt,
}: {
  imageKey: string;
  className?: string;
  alt?: string;
}) {
  const src = productPhotoSrc(imageKey);
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden bg-[oklch(0.16_0.02_50)]",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt ?? ""}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,oklch(0.4_0.07_60_/_0.45),transparent_62%)]" />
      )}
    </div>
  );
}
