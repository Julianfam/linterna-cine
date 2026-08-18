import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { LanternMark } from "@/components/nav";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-bg px-6 text-fg">
      <img
        src="/art/hero-cinema.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-bg/70" />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface/90 p-7">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <LanternMark />
          <span className="font-display text-2xl font-medium">Linterna</span>
        </Link>
        <h1 className="mt-6 font-display text-3xl font-medium tracking-tight">Entra a la sala</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          El cine es libre. La cuenta solo guarda tu asiento — lista y progreso — si quieres.
        </p>
        <div className="mt-6 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="flex h-11 w-full items-center justify-center rounded-md border border-border bg-elevated text-sm font-medium text-fg transition-colors duration-150 hover:bg-elevated/80"
              >
                Continuar con {p.label}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">El acceso está desactivado en esta sesión.</p>
          )}
        </div>
        <Link to="/" className="mt-6 block text-center text-sm text-muted hover:text-fg">
          Seguir como invitado
        </Link>
      </div>
    </main>
  );
}
