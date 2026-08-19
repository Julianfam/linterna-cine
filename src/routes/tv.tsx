import { createFileRoute, Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { FILMS, featuredFilms, posterUrl } from "@/lib/catalog";

export const Route = createFileRoute("/tv")({
  component: TvSala,
  head: () => ({
    meta: [
      { title: "CineLinterna · Sala de TV" },
      {
        name: "description",
        content: "Cartelera grande para ver CineLinterna en el televisor.",
      },
    ],
  }),
});

function TvSala() {
  const destacadas = featuredFilms();
  const resto = FILMS.filter((f) => !destacadas.some((d) => d.id === f.id));

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav solid />
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6">
        <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">Sala de TV</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] font-medium sm:text-7xl">
          Enciende la tele y elige butaca.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Abre esta página en el navegador de la tele (Samsung, LG, Android TV, Fire TV). Desde el
          móvil o el iPad, entra a una película y pulsa el icono de TV para enviarla por AirPlay o
          Chromecast.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-3xl font-medium">Para ver ahora</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {destacadas.map((film) => (
              <Link
                key={film.id}
                to="/ver/$slug"
                params={{ slug: film.id }}
                search={{ pista: "es" }}
                className="tv-card group block rounded-lg focus-visible:outline-none"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg bg-elevated">
                  <img
                    src={posterUrl(film)}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-bg via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 grid size-12 place-items-center rounded-full bg-primary text-primary-fg">
                    <Play className="ml-0.5 size-5 fill-current" />
                  </span>
                </div>
                <p className="mt-2 truncate text-lg text-fg">{film.title}</p>
                <p className="text-sm text-muted tabular-nums">{film.year}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-3xl font-medium">Toda la cartelera</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {resto.map((film) => (
              <Link
                key={film.id}
                to="/ver/$slug"
                params={{ slug: film.id }}
                search={{ pista: "es" }}
                className="tv-card group block rounded-lg focus-visible:outline-none"
              >
                <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-elevated">
                  <img
                    src={posterUrl(film)}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
                <p className="mt-2 truncate text-base text-fg">{film.title}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
