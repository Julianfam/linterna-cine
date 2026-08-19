import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/hero";
import { ContinueRow, MovieRow } from "@/components/movie-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/nav";
import { BROWSE_ROWS, filmsByGenre, getFilm } from "@/lib/catalog";
import { spanishFilms } from "@/lib/languages";
import { useLibrary } from "@/lib/library";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const progress = useLibrary((s) => s.progress);
  const added = useLibrary((s) => s.added);
  const items = Object.values(progress)
    .filter((p) => p.duration > 0 && p.seconds / p.duration < 0.95 && p.seconds > 8)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => {
      const film = getFilm(p.slug) ?? added[p.slug];
      return film ? { film, seconds: p.seconds, duration: p.duration } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const progressBySlug = Object.fromEntries(
    Object.values(progress).map((p) => [p.slug, p.duration > 0 ? p.seconds / p.duration : 0]),
  );

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav />
      <Hero />
      <div className="relative z-10 -mt-6 flex flex-col gap-12 pb-8">
        <ContinueRow items={items} />
        <MovieRow
          title="En español"
          films={spanishFilms()}
          progressBySlug={progressBySlug}
        />
        {Object.keys(added).length > 0 ? (
          <MovieRow title="Tu archivo" films={Object.values(added)} progressBySlug={progressBySlug} />
        ) : null}
        {BROWSE_ROWS.map((row) => (
          <MovieRow
            key={row.id}
            title={row.title}
            films={filmsByGenre(row.id)}
            progressBySlug={progressBySlug}
          />
        ))}
      </div>
      <SiteFooter />
    </div>
  );
}
