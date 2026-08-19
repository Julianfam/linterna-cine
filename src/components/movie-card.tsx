import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { type Film } from "@/lib/catalog";
import { spanishLabel } from "@/lib/languages";
import { useLibrary } from "@/lib/library";
import { Poster } from "@/components/poster";
import { cn } from "@/lib/utils";

export function MovieCard({
  film,
  progress,
  layout = "row",
}: {
  film: Film;
  progress?: number;
  layout?: "row" | "grid";
}) {
  const pct = progress && progress > 0 && progress < 0.95 ? progress : 0;
  const generated = useLibrary((s) => Boolean(s.generatedSubs[film.id]));
  const es = spanishLabel(film) ?? (generated ? "Sub ES" : null);

  return (
    <Link
      to="/pelicula/$slug"
      params={{ slug: film.id }}
      className={cn(
        "group block",
        layout === "row" && "w-[42vw] shrink-0 sm:w-[28vw] md:w-[18vw] lg:w-[14.5vw] xl:w-[196px]",
        layout === "grid" && "w-full",
      )}
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-md bg-elevated transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5">
        <Poster film={film} className="absolute inset-0" />
        <div className="absolute inset-0 bg-bg/0 transition-colors duration-200 group-hover:bg-bg/25" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-fg">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {es ? (
            <span className="rounded-xs border border-border bg-bg/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-fg">
              {es}
            </span>
          ) : null}
          {film.quality === "HD" ? (
            <span className="rounded-xs border border-border bg-bg/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-fg">
              HD
            </span>
          ) : null}
        </div>
        {pct > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-elevated">
            <div className="h-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        ) : null}
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-medium text-fg">{film.title}</p>
        <p className="mt-0.5 text-xs text-muted tabular-nums">
          {film.year}
          <span className="mx-1.5 text-subtle">·</span>
          {film.director.split(",")[0]}
        </p>
      </div>
    </Link>
  );
}

export function ContinueCard({ film, seconds, duration }: { film: Film; seconds: number; duration: number }) {
  const pct = duration > 0 ? seconds / duration : 0;
  const remaining = Math.max(1, Math.round((duration - seconds) / 60));

  return (
    <Link to="/ver/$slug" params={{ slug: film.id }} search={{ pista: "es" }} className="group block w-[72vw] shrink-0 sm:w-[420px]">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-elevated">
        <Poster film={film} className="absolute inset-0" sizes="420px" />
        <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display text-xl font-medium text-fg">{film.title}</p>
          <p className="mt-1 text-xs text-muted">Quedan {remaining} min</p>
        </div>
        <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-fg opacity-95 transition-transform duration-150 group-hover:scale-105">
          <Play className="ml-0.5 size-5 fill-current" />
        </span>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-elevated">
          <div className="h-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      </div>
    </Link>
  );
}
