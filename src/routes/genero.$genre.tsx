import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MovieCard } from "@/components/movie-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/nav";
import { GENRES, filmsByGenre, type GenreId } from "@/lib/catalog";

const GENRE_IDS = Object.keys(GENRES) as GenreId[];

export const Route = createFileRoute("/genero/$genre")({
  loader: ({ params }) => {
    const genre = params.genre as GenreId;
    if (!GENRE_IDS.includes(genre)) throw notFound();
    return { genre, films: filmsByGenre(genre) };
  },
  component: GenrePage,
});

function GenrePage() {
  const { genre, films } = Route.useLoaderData();

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav solid />
      <main className="mx-auto max-w-7xl px-4 pt-24 pb-16 sm:px-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">{GENRES[genre]}</h1>
        <div className="mt-6 hide-scrollbar flex gap-2 overflow-x-auto pb-2">
          {GENRE_IDS.filter((g) => g !== "destacadas").map((g) => (
            <Link
              key={g}
              to="/genero/$genre"
              params={{ genre: g }}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors duration-150 ${
                g === genre
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              {GENRES[g]}
            </Link>
          ))}
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {films.map((film) => (
            <MovieCard key={film.id} film={film} layout="grid" />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
