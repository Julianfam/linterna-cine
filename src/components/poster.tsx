import { useEffect, useState } from "react";
import { posterUrl, type Film } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function Poster({
  film,
  className,
  sizes = "(max-width: 640px) 42vw, 180px",
  eager = false,
  kind = "card",
}: {
  film: Film;
  className?: string;
  sizes?: string;
  eager?: boolean;
  kind?: "card" | "hero";
}) {
  const webp = posterUrl(film, kind);
  const full = posterUrl(film, "full");
  const archive = `https://archive.org/services/img/${film.archiveId}`;
  const [src, setSrc] = useState(webp);

  useEffect(() => {
    setSrc(webp);
  }, [webp]);

  return (
    <div className={cn("relative overflow-hidden bg-elevated", className)}>
      <img
        src={src}
        alt=""
        sizes={sizes}
        width={kind === "hero" ? 1100 : 400}
        height={kind === "hero" ? 1650 : 600}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        className="absolute inset-0 size-full object-cover"
        onError={() => {
          if (src === webp && full !== webp) setSrc(full);
          else if (src !== archive) setSrc(archive);
        }}
      />
      <div className="pointer-events-none absolute inset-0 poster-outline" />
    </div>
  );
}
