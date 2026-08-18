import { createFileRoute, Link } from "@tanstack/react-router";
import { MovieCard } from "@/components/movie-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/nav";
import { getFilm } from "@/lib/catalog";
import { useLibrary } from "@/lib/library";

export const Route = createFileRoute("/lista")({ component: ListPage });

function ListPage() {
  const ids = useLibrary((s) => s.list);
  const added = useLibrary((s) => s.added);
  const films = ids
    .map((id) => getFilm(id) ?? added[id])
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav solid />
      <main className="mx-auto max-w-7xl px-4 pt-24 pb-16 sm:px-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">Mi lista</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Se guarda en este dispositivo. Entra en tu cuenta si quieres llevarla a otro sitio más
          adelante.
        </p>
        {films.length === 0 ? (
          <div className="mt-16 max-w-md">
            <p className="text-muted">Todavía no hay nada en la butaca de al lado.</p>
            <Link to="/" className="mt-4 inline-flex h-11 items-center text-sm text-fg underline-offset-4 hover:underline">
              Ir a la cartelera
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {films.map((film) => (
              <MovieCard key={film.id} film={film} layout="grid" />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
