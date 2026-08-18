import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Player } from "@/components/player";
import { resolveFilm } from "@/lib/discover";

export const Route = createFileRoute("/ver/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    pista:
      search.pista === "original"
        ? ("original" as const)
        : search.pista === "subs"
          ? ("subs" as const)
          : ("es" as const),
  }),
  loader: async ({ params }) => {
    const film = await resolveFilm(params.slug);
    if (!film) throw notFound();
    return { film };
  },
  component: WatchPage,
  notFoundComponent: () => (
    <div className="grid min-h-svh place-items-center bg-bg px-6 text-fg">
      <div className="text-center">
        <p className="font-display text-4xl">No hay copia de ese título</p>
        <Link to="/" className="mt-4 inline-block text-sm text-muted hover:text-fg">
          Volver al inicio
        </Link>
      </div>
    </div>
  ),
});

function WatchPage() {
  const { film } = Route.useLoaderData();
  const { pista } = Route.useSearch();
  return <Player film={film} pista={pista} />;
}
