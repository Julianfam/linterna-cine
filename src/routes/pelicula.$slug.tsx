import { useEffect } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, Play } from "lucide-react";
import { toast } from "sonner";
import { Meta } from "@/components/hero";
import { MovieRow } from "@/components/movie-row";
import { Poster } from "@/components/poster";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { GENRES, LICENSE_LABEL, posterUrl, relatedFilms } from "@/lib/catalog";
import { resolveFilm } from "@/lib/discover";
import { langInfo, playArchiveId } from "@/lib/languages";
import { prefetchStream } from "@/lib/archive";
import { useLibrary } from "@/lib/library";

export const Route = createFileRoute("/pelicula/$slug")({
  loader: async ({ params }) => {
    const film = await resolveFilm(params.slug);
    if (!film) throw notFound();
    return { film };
  },
  component: FilmPage,
  notFoundComponent: FilmMissing,
});

function FilmPage() {
  const { film } = Route.useLoaderData();
  const inList = useLibrary((s) => s.list.includes(film.id));
  const toggleList = useLibrary((s) => s.toggleList);
  const addFilm = useLibrary((s) => s.addFilm);
  const progress = useLibrary((s) => s.progress[film.id]);
  const related = relatedFilms(film);
  const resume = progress && progress.seconds > 8;
  const lang = langInfo(film);
  const spanishLine =
    lang.audio === "es"
      ? "Audio en español"
      : lang.captions === "es-vtt"
        ? "Subtítulos en español (se activan solos)"
        : lang.captions === "es-burned"
          ? "Copia con subtítulos en español"
          : lang.audio === "silent" || lang.audio === "none"
            ? "Sin diálogos — se entiende sin traducción"
            : "Audio original, sin subtítulos en español todavía";

  useEffect(() => {
    prefetchStream(playArchiveId(film, "es"), film.id);
    prefetchStream(film.archiveId, film.id);
    if (film.id.startsWith("ia-")) addFilm(film);
  }, [film, addFilm]);

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav />
      <div className="relative">
        <div className="absolute inset-0 h-[70vh] overflow-hidden">
          <img src={posterUrl(film)} alt="" className="size-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/70 to-bg/40" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 pt-28 pb-12 sm:px-6 lg:flex-row lg:items-end lg:gap-12">
          <Poster
            film={film}
            className="aspect-2/3 w-48 shrink-0 rounded-lg sm:w-64 lg:w-72"
            sizes="224px"
          />
          <div className="min-w-0 pb-2">
            <p className="text-xs font-medium tracking-[0.2em] text-muted uppercase">
              {LICENSE_LABEL[film.license]}
            </p>
            <h1 className="mt-2 font-display text-4xl leading-[0.95] font-medium tracking-tight sm:text-6xl">
              {film.title}
            </h1>
            {film.originalTitle && film.originalTitle !== film.title ? (
              <p className="mt-2 text-sm text-muted italic">{film.originalTitle}</p>
            ) : null}
            <Meta film={film} />
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {film.synopsis}
            </p>
            <dl className="mt-5 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-subtle">Dirección</dt>
                <dd className="mt-0.5 text-fg">{film.director}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">País</dt>
                <dd className="mt-0.5 text-fg">{film.country}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Idioma</dt>
                <dd className="mt-0.5 text-fg">{spanishLine}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Géneros</dt>
                <dd className="mt-0.5 text-fg">
                  {film.genres
                    .filter((g) => g !== "destacadas")
                    .map((g) => GENRES[g])
                    .join(" · ")}
                </dd>
              </div>
            </dl>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/ver/$slug" params={{ slug: film.id }} search={{ pista: "es" }}>
                  <Play className="ml-0.5 size-4 fill-current" />
                  {resume ? "Continuar" : "Reproducir"}
                </Link>
              </Button>
              {lang.esArchiveId ? (
                <Button asChild size="lg" variant="outline">
                  <Link to="/ver/$slug" params={{ slug: film.id }} search={{ pista: "subs" }}>
                    Subtítulos ES
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => {
                  toggleList(film.id);
                  toast(inList ? "Fuera de tu lista" : "Guardada en tu lista");
                }}
              >
                {inList ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                {inList ? "En mi lista" : "Mi lista"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="pb-10">
        <MovieRow title="También en sala" films={related} />
      </div>
      <SiteFooter />
    </div>
  );
}

function FilmMissing() {
  return (
    <div className="grid min-h-svh place-items-center bg-bg px-6 text-fg">
      <div className="text-center">
        <p className="font-display text-4xl">Ese título no está en cartelera</p>
        <Link to="/" className="mt-4 inline-block text-sm text-muted hover:text-fg">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
