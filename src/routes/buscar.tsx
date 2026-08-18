import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { MovieCard } from "@/components/movie-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FILMS, searchFilms, type Film } from "@/lib/catalog";
import { ARCHIVE_HINTS, searchArchive } from "@/lib/discover";
import { useLibrary } from "@/lib/library";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/buscar")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
    fuente: search.fuente === "archivo" ? ("archivo" as const) : ("sala" as const),
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q: q0, fuente } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(q0);
  const [tab, setTab] = useState<"sala" | "archivo">(fuente);
  const local = useMemo(() => (q.trim() ? searchFilms(q) : FILMS), [q]);
  const added = useLibrary((s) => s.added);
  const addFilm = useLibrary((s) => s.addFilm);
  const addedList = Object.values(added);

  const [remote, setRemote] = useState<Film[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(q0);
  }, [q0]);

  useEffect(() => {
    if (tab !== "archivo") return;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchArchive(q)
        .then((films) => setRemote(films))
        .catch((err: unknown) => {
          setRemote([]);
          setError(err instanceof Error ? err.message : "No se pudo buscar en el archivo.");
        })
        .finally(() => setLoading(false));
    }, q.trim() ? 380 : 80);
    return () => window.clearTimeout(handle);
  }, [q, tab]);

  const commit = (value: string, nextTab = tab) => {
    setQ(value);
    void navigate({
      to: "/buscar",
      search: { q: value, fuente: nextTab },
      replace: true,
    });
  };

  return (
    <div className="min-h-svh bg-bg text-fg">
      <SiteNav solid />
      <main className="mx-auto max-w-7xl px-4 pt-24 pb-16 sm:px-6">
        <p className="text-xs tracking-[0.18em] text-subtle uppercase">Sala + archivo libre</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Buscar y agregar</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          La cartelera es una selección. El archivo busca en Internet Archive solo copias de
          dominio público o Creative Commons y las suma a tu sala.
        </p>
        <div className="mt-6 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => commit(e.target.value)}
              placeholder="Título, director, año…"
              aria-label="Buscar películas"
              className="pl-10"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Tab
            active={tab === "sala"}
            onClick={() => {
              setTab("sala");
              commit(q, "sala");
            }}
          >
            Cartelera
          </Tab>
          <Tab
            active={tab === "archivo"}
            onClick={() => {
              setTab("archivo");
              commit(q, "archivo");
            }}
          >
            Archivo libre
          </Tab>
        </div>

        {tab === "archivo" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {ARCHIVE_HINTS.map((hint) => (
              <button
                key={hint.label}
                type="button"
                onClick={() => commit(hint.q, "archivo")}
                className="h-8 rounded-full border border-border px-3 text-xs text-muted transition-colors hover:border-fg hover:text-fg"
              >
                {hint.label}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "sala" ? (
          <>
            <p className="mt-5 text-sm text-muted tabular-nums">
              {local.length} {local.length === 1 ? "título" : "títulos"} en cartelera
            </p>
            <Grid films={local} />
            {addedList.length > 0 ? (
              <section className="mt-14">
                <h2 className="font-display text-2xl">Ya en tu archivo</h2>
                <div className="mt-6">
                  <Grid films={addedList} />
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted">
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {loading
                ? "Buscando copias libres…"
                : `${remote.length} ${remote.length === 1 ? "copia" : "copias"} encontradas`}
            </p>
            {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
            {!loading && remote.length === 0 && !error ? (
              <p className="mt-16 max-w-md text-muted">
                Nada con esa búsqueda en el archivo filtrado. Prueba Méliès, 1927 o Blender.
              </p>
            ) : (
              <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {remote.map((film) => (
                  <div key={film.id} className="relative">
                    <MovieCard film={film} layout="grid" />
                    <Button
                      type="button"
                      size="sm"
                      variant="subtle"
                      className="absolute top-2 left-2 h-8 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addFilm(film);
                        toast("Añadida a tu sala");
                      }}
                    >
                      <Plus className="size-3.5" />
                      Agregar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-4 text-sm transition-colors",
        active ? "bg-primary text-primary-fg" : "border border-border text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Grid({ films }: { films: Film[] }) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {films.map((film) => (
        <MovieCard key={film.id} film={film} layout="grid" />
      ))}
    </div>
  );
}
