import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heroFilms, posterUrl, type Film } from "@/lib/catalog";
import { formatRuntime } from "@/lib/utils";

export function Hero() {
  const films = heroFilms();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (films.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % films.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, [films.length]);

  const film = films[index] ?? films[0];
  if (!film) return null;

  return (
    <section className="relative min-h-[88svh] overflow-hidden">
      <div className="absolute inset-0">
        {films.map((f, i) =>
          Math.abs(i - index) > 1 && i !== 0 ? null : (
            <img
              key={f.id}
              src={posterUrl(f, "hero")}
              alt=""
              className="absolute inset-0 size-full object-cover transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ opacity: i === index ? 1 : 0 }}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
            />
          ),
        )}
        <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/55 to-bg/25" />
        <div className="absolute inset-0 bg-linear-to-r from-bg via-bg/40 to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-[88svh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20">
        <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
          Sala libre · {film.year}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] font-medium tracking-tight text-fg sm:text-6xl md:text-7xl">
          {film.title}
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          {film.synopsis}
        </p>
        <Meta film={film} />
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/ver/$slug" params={{ slug: film.id }} search={{ pista: "es" }}>
              <Play className="ml-0.5 size-4 fill-current" />
              Reproducir
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pelicula/$slug" params={{ slug: film.id }}>
              <Info className="size-4" />
              Ficha
            </Link>
          </Button>
        </div>
        <div className="mt-8 flex gap-2">
          {films.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-label={f.title}
              onClick={() => setIndex(i)}
              className="h-1 w-8 rounded-full bg-elevated"
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: i === index ? "100%" : "0%" }}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Meta({ film }: { film: Film }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
      <span>{film.year}</span>
      <span className="text-subtle">·</span>
      <span>{formatRuntime(film.runtime)}</span>
      <span className="text-subtle">·</span>
      <span>{film.director.split(",")[0]}</span>
      {film.quality === "HD" ? (
        <>
          <span className="text-subtle">·</span>
          <span className="rounded-xs border border-border px-1.5 py-0.5 text-[10px] tracking-wide text-fg">
            HD
          </span>
        </>
      ) : null}
    </p>
  );
}
