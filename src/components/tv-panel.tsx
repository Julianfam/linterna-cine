import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Tv, X } from "lucide-react";
import { toast } from "sonner";
import type { StreamInfo } from "@/lib/archive";
import { posterUrl, type Film } from "@/lib/catalog";
import { sendToTv, tvSalaUrl, watchUrl } from "@/lib/tv";

export function TvPanel({
  film,
  pista,
  stream,
  video,
  onClose,
}: {
  film: Film;
  pista: string;
  stream: StreamInfo | null;
  video: HTMLVideoElement | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"film" | "sala" | null>(null);
  const filmLink = watchUrl(film.id, pista);
  const salaLink = tvSalaUrl();

  const copy = async (value: string, which: "film" | "sala") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar. Selecciónalo a mano.");
    }
  };

  const send = async () => {
    if (!stream) {
      toast("Espera a que cargue la copia.");
      return;
    }
    setBusy(true);
    try {
      const result = await sendToTv({
        video,
        stream,
        title: film.title,
        poster: posterUrl(film),
      });
      if (result === "cast") toast("Reproduciendo en la tele");
      else if (result === "picker") toast("Elige Apple TV o la pantalla");
      else toast("No apareció ninguna tele. Prueba AirPlay, Chromecast o el enlace.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-bg/70 p-3 sm:place-items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="tv-title"
        className="player-chrome relative w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-md bg-elevated text-fg">
            <Tv className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="tv-title" className="font-display text-2xl text-fg">
              Ver en la tele
            </p>
            <p className="mt-1 text-sm text-muted">{film.title}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-md text-fg hover:bg-elevated"
          >
            <X className="size-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !stream}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-fg disabled:opacity-40"
        >
          {busy ? "Buscando la tele…" : "Enviar a Apple TV o Chromecast"}
        </button>

        <ol className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
          <li>
            <span className="font-medium text-fg">iPad / iPhone / Mac.</span> Pulsa enviar y elige el
            Apple TV. También vale el icono de AirPlay en los controles del vídeo.
          </li>
          <li>
            <span className="font-medium text-fg">Android o Chrome.</span> El mismo botón abre
            Chromecast, Google TV o Android TV en la misma red.
          </li>
          <li>
            <span className="font-medium text-fg">Tele con navegador.</span> Abre la sala de TV y
            elige la película con el mando.
          </li>
        </ol>

        <div className="mt-5 space-y-2">
          <CopyRow
            label="Esta película"
            value={filmLink}
            copied={copied === "film"}
            onCopy={() => void copy(filmLink, "film")}
          />
          <CopyRow
            label="Sala de TV"
            value={salaLink}
            copied={copied === "sala"}
            onCopy={() => void copy(salaLink, "sala")}
          />
        </div>

        <Link
          to="/tv"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border text-sm text-fg hover:bg-elevated"
        >
          Abrir sala de TV
        </Link>
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-elevated px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">{label}</p>
        <p className="truncate text-xs text-fg">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copiar ${label}`}
        onClick={onCopy}
        className="grid size-10 shrink-0 place-items-center rounded-md text-fg hover:bg-surface"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
