import { useState } from "react";
import { posterUrl, type Film } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function Poster({
  film,
  className,
  sizes = "(max-width: 640px) 42vw, 180px",
  eager = false,
}: {
  film: Film;
  className?: string;
  sizes?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? `https://archive.org/services/img/${film.archiveId}` : posterUrl(film);

  return (
    <div className={cn("relative overflow-hidden bg-elevated", className)}>
      <img
        src={src}
        alt=""
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className="pointer-events-none absolute inset-0 poster-outline" />
    </div>
  );
}
