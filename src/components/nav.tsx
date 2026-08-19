import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Bookmark } from "lucide-react";
import { AuthSlot } from "@/components/auth-slot";
import { cn } from "@/lib/utils";

export function SiteNav({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const locked = solid || scrolled;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,backdrop-filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        locked ? "bg-bg/92 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-[4.5rem] sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-fg">
          <span className="grid size-8 place-items-center rounded-sm border border-border bg-surface">
            <LanternMark />
          </span>
          <span className="font-display text-2xl font-medium tracking-tight">CineLinterna</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-5 text-sm text-muted md:flex">
          <Link
            to="/"
            className={cn("transition-colors duration-150 hover:text-fg", path === "/" ? "text-fg" : "text-muted")}
          >
            Cartelera
          </Link>
          <Link
            to="/genero/$genre"
            params={{ genre: "terror" }}
            className={cn(
              "transition-colors duration-150 hover:text-fg",
              path.startsWith("/genero") ? "text-fg" : "text-muted",
            )}
          >
            Géneros
          </Link>
          <Link
            to="/buscar"
            search={{ q: "", fuente: "archivo" }}
            className={cn(
              "transition-colors duration-150 hover:text-fg",
              path === "/buscar" ? "text-fg" : "text-muted",
            )}
          >
            Archivo
          </Link>
          <Link
            to="/lista"
            className={cn(
              "transition-colors duration-150 hover:text-fg",
              path === "/lista" ? "text-fg" : "text-muted",
            )}
          >
            Mi lista
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/buscar"
            search={{ q: "", fuente: "sala" }}
            aria-label="Buscar"
            className={cn(
              "grid size-11 place-items-center rounded-md text-fg transition-colors duration-150 hover:bg-elevated",
              path === "/buscar" && "bg-elevated",
            )}
          >
            <Search className="size-5" strokeWidth={1.6} />
          </Link>
          <Link
            to="/lista"
            aria-label="Mi lista"
            className="grid size-11 place-items-center rounded-md text-fg transition-colors duration-150 hover:bg-elevated md:hidden"
          >
            <Bookmark className="size-5" strokeWidth={1.6} />
          </Link>
          <AuthSlot />
        </div>
      </div>
    </header>
  );
}

export function LanternMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 text-fg", className)} fill="none" aria-hidden>
      <path
        d="M8 9.5c0-2.2 1.8-4 4-4s4 1.8 4 4v6.2c0 1.4-1.2 2.6-2.6 2.6h-2.8C9.2 18.3 8 17.1 8 15.7V9.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M12 5.5V3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.2 20.2h5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.2 11.2h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
