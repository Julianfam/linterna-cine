import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Film } from "@/lib/catalog";
import { ContinueCard, MovieCard } from "@/components/movie-card";
import { cn } from "@/lib/utils";

export function MovieRow({
  title,
  films,
  progressBySlug,
}: {
  title: string;
  films: Film[];
  progressBySlug?: Record<string, number>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  if (films.length === 0) return null;

  const scroll = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 720), behavior: "smooth" });
  };

  return (
    <section className="relative catalog-row">
      <div className="mx-auto flex max-w-7xl items-end justify-between px-4 sm:px-6">
        <h2 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">{title}</h2>
      </div>
      <div className="group/row relative mt-4">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => scroll(-1)}
          className="absolute top-0 bottom-8 left-0 z-10 hidden w-10 items-center justify-center bg-linear-to-r from-bg to-transparent text-fg opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex"
        >
          <ChevronLeft className="size-7" />
        </button>
        <div
          ref={scroller}
          className={cn("hide-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6")}
        >
          {films.map((film) => (
            <MovieCard key={film.id} film={film} progress={progressBySlug?.[film.id]} />
          ))}
        </div>
        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => scroll(1)}
          className="absolute top-0 bottom-8 right-0 z-10 hidden w-10 items-center justify-center bg-linear-to-l from-bg to-transparent text-fg opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex"
        >
          <ChevronRight className="size-7" />
        </button>
      </div>
    </section>
  );
}

export function ContinueRow({
  items,
}: {
  items: { film: Film; seconds: number; duration: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
          Seguir viendo
        </h2>
      </div>
      <div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6">
        {items.map(({ film, seconds, duration }) => (
          <ContinueCard key={film.id} film={film} seconds={seconds} duration={duration} />
        ))}
      </div>
    </section>
  );
}
