import { Link } from "@tanstack/react-router";
import { LanternMark } from "@/components/nav";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-2 text-fg">
            <LanternMark />
            <span className="font-display text-xl font-medium">Linterna</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Cine que ya es de todos. Clásicos en dominio público y obras liberadas bajo
            Creative Commons, servidas desde Internet Archive. Nada pirateado, nada con
            anuncio, nada que se esconda detrás de un muro.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.18em] text-subtle uppercase">Sala</p>
            <Link to="/" className="block text-muted hover:text-fg">
              Cartelera
            </Link>
            <Link to="/buscar" search={{ q: "", fuente: "archivo" }} className="block text-muted hover:text-fg">
              Archivo
            </Link>
            <Link to="/lista" className="block text-muted hover:text-fg">
              Mi lista
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-xs tracking-[0.18em] text-subtle uppercase">Origen</p>
            <a
              href="https://archive.org/details/feature_films"
              className="block text-muted hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              Internet Archive
            </a>
            <a
              href="https://studio.blender.org/films/"
              className="block text-muted hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              Blender Open Movies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
