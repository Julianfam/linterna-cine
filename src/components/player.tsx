import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Subtitles,
} from "lucide-react";
import {
  devicePrefersMp4,
  knownArchiveStream,
  playbackStream,
  resolveStream,
  resolveStreamClient,
  type StreamInfo,
} from "@/lib/archive";
import { type Film } from "@/lib/catalog";
import { langInfo } from "@/lib/languages";
import { useLibrary } from "@/lib/library";
import { cn, formatClock } from "@/lib/utils";

export function Player({ film, pista = "es" }: { film: Film; pista?: "es" | "original" | "subs" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const lang = langInfo(film);
  const useBurned = pista === "subs" && Boolean(lang.esArchiveId);
  const playId = useBurned ? (lang.esArchiveId as string) : film.archiveId;
  const subUrl = useBurned ? undefined : lang.subUrl;
  const [apple, setApple] = useState(false);
  const [stream, setStream] = useState<StreamInfo | null>(() =>
    useBurned ? knownArchiveStream(playId) : playbackStream(film.id, playId, false),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [filled, setFilled] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false);
  const [subsOn, setSubsOn] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const saveProgress = useLibrary((s) => s.saveProgress);
  const existing = useLibrary((s) => s.progress[film.id]);

  useLayoutEffect(() => {
    setApple(devicePrefersMp4());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const preferMp4 = apple || devicePrefersMp4();
    const known = useBurned
      ? knownArchiveStream(playId)
      : playbackStream(film.id, playId, preferMp4);
    if (known) {
      setStream(known);
      setError(null);
      setUseEmbed(false);
      setLoading(true);
      return;
    }
    setLoading(true);
    setError(null);
    setStream(null);
    setUseEmbed(false);

    const load = async () => {
      try {
        const info = await resolveStreamClient(playId, film.id, preferMp4);
        if (!cancelled) setStream(info);
      } catch {
        try {
          const info = await resolveStream({
            data: { archiveId: playId, filmId: film.id, preferMp4 },
          });
          if (!cancelled) setStream(info);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "No se pudo abrir el archivo.");
            setLoading(false);
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [playId, film.id, useBurned, apple]);

  useEffect(() => {
    if (!stream || useEmbed) return;
    const id = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.readyState >= 2 || v.buffered.length > 0) return;
      setUseEmbed(true);
      setLoading(false);
    }, 16000);
    return () => window.clearTimeout(id);
  }, [stream, useEmbed]);

  useEffect(() => {
    const sync = () => {
      if (!isNativeFullscreen()) setFilled(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (filled) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || useEmbed) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - 10);
      } else if (e.key === "f") {
        e.preventDefault();
        toggleFill();
      } else if (e.key === "Escape" && filled) {
        e.preventDefault();
        exitFill();
      } else if (e.key === "m") {
        v.muted = !v.muted;
        setMuted(v.muted);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (const track of Array.from(v.textTracks)) {
      track.mode = subsOn && track.language === "es" ? "showing" : "hidden";
    }
  }, [subsOn, stream, subUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("x5-playsinline", "true");
    if (v.readyState >= 1) onLoaded();
  }, [stream, apple]);

  const bumpChrome = () => {
    setChrome(true);
    if (apple) return;
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (useEmbed) return;
      if (videoRef.current && !videoRef.current.paused) setChrome(false);
    }, 2800);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void startPlayback();
    else v.pause();
  };

  const startPlayback = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      setNeedsTap(false);
      setLoading(false);
    } catch {
      setNeedsTap(true);
      setLoading(false);
    }
  };

  const unmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    setNeedsTap(false);
    void v.play().catch(() => setNeedsTap(true));
  };

  const exitFill = () => {
    setFilled(false);
    void exitNativeFullscreen();
  };

  const toggleFill = () => {
    if (filled || isNativeFullscreen()) {
      exitFill();
      return;
    }
    setFilled(true);
    setChrome(true);
    if (!apple) {
      void enterNativeFullscreen(shellRef.current, videoRef.current);
    }
  };

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setLoading(false);
    if (existing && existing.seconds > 8 && existing.seconds < (v.duration || 0) - 10) {
      v.currentTime = existing.seconds;
    }
    if (apple) {
      v.muted = true;
      setMuted(true);
    }
    void startPlayback();
  };

  const onTime = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    if (Math.floor(v.currentTime) % 5 === 0) {
      saveProgress({ slug: film.id, seconds: v.currentTime, duration: v.duration || 0 });
    }
  };

  const seek = (ratio: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = ratio * v.duration;
  };

  const showChrome = apple || chrome;
  const showUnmute = Boolean((apple && muted) || needsTap);

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex flex-col bg-bg text-fg",
        filled ? "fixed inset-0 z-80" : "relative min-h-svh",
      )}
      style={
        filled
          ? { position: "fixed", inset: 0, zIndex: 80, width: "100vw", height: "100dvh", background: "#09090b" }
          : undefined
      }
      onMouseMove={bumpChrome}
      onPointerDown={bumpChrome}
    >
      <div
        className="player-chrome relative z-20 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5"
        style={{
          background: apple || filled ? "#09090b" : "transparent",
        }}
      >
        <Link
          to="/pelicula/$slug"
          params={{ slug: film.id }}
          className="grid size-12 shrink-0 place-items-center rounded-md bg-elevated text-fg"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl text-fg sm:text-2xl">{film.title}</p>
          <p className="text-xs text-muted tabular-nums">
            {film.year} · {film.director.split(",")[0]}
          </p>
        </div>
        {showUnmute ? (
          <button
            type="button"
            aria-label={needsTap && !playing ? "Reproducir" : "Activar sonido"}
            onClick={(e) => {
              e.stopPropagation();
              if (needsTap && videoRef.current?.paused) void startPlayback();
              unmute();
            }}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg sm:px-4"
          >
            <Volume2 className="size-4" />
            <span className="hidden sm:inline">{needsTap && !playing ? "Reproducir" : "Tocar para oír"}</span>
            <span className="sm:hidden">{needsTap && !playing ? "Play" : "Audio"}</span>
          </button>
        ) : null}
        <button
          type="button"
          aria-label={filled ? "Achicar pantalla" : "Agrandar pantalla"}
          onClick={(e) => {
            e.stopPropagation();
            toggleFill();
          }}
          className="grid size-12 shrink-0 place-items-center rounded-md bg-elevated text-fg ring-1 ring-border"
        >
          {filled ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          "relative z-0 min-h-0",
          filled ? "flex-1" : "flex flex-1 items-center justify-center px-3 pb-6 sm:px-6",
        )}
      >
        <div
          className={cn(
            "overflow-hidden bg-elevated",
            filled ? "absolute inset-0" : "relative mx-auto aspect-video w-full max-w-6xl rounded-lg",
          )}
        >
          {useEmbed && stream ? (
            <iframe
              src={stream.embedUrl}
              title={film.title}
              className="absolute inset-0 size-full border-0"
              allow="fullscreen; autoplay"
              allowFullScreen
            />
          ) : stream ? (
            <video
              ref={videoRef}
              src={stream.url}
              className={cn("absolute inset-0 size-full bg-bg", filled ? "object-cover" : "object-contain")}
              playsInline
              preload="auto"
              controls={apple}
              muted={apple ? muted : undefined}
              onClick={() => {
                bumpChrome();
                if (!apple) togglePlay();
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                toggleFill();
              }}
              onPlay={() => {
                setPlaying(true);
                setNeedsTap(false);
              }}
              onPause={() => {
                setPlaying(false);
                setChrome(true);
                const v = videoRef.current;
                if (v) saveProgress({ slug: film.id, seconds: v.currentTime, duration: v.duration || 0 });
              }}
              onLoadedMetadata={onLoaded}
              onTimeUpdate={onTime}
              onWaiting={() => setLoading(true)}
              onPlaying={() => setLoading(false)}
              onVolumeChange={() => {
                const v = videoRef.current;
                if (!v) return;
                setMuted(v.muted);
              }}
              onError={() => {
                const v = videoRef.current;
                if (stream.fallbackUrl && v && !v.src.includes(stream.fallbackUrl)) {
                  v.src = stream.fallbackUrl;
                  void startPlayback();
                  return;
                }
                setUseEmbed(true);
                setLoading(false);
              }}
            >
              {subUrl ? (
                <track kind="subtitles" src={subUrl} srcLang="es" label="Español" default={subsOn} />
              ) : null}
            </video>
          ) : null}

          {loading && !error && !useEmbed ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
              <div className="text-center">
                <div className="mx-auto size-10 animate-spin rounded-full border-2 border-border border-t-primary" />
                <p className="mt-4 text-sm text-muted">Abriendo una copia ligera…</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="absolute inset-0 z-30 grid place-items-center px-6">
          <div className="max-w-md text-center">
            <p className="font-display text-3xl text-fg">No hay señal</p>
            <p className="mt-3 text-sm text-muted">{error}</p>
            <Link
              to="/pelicula/$slug"
              params={{ slug: film.id }}
              className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-fg"
            >
              Volver a la ficha
            </Link>
          </div>
        </div>
      ) : null}

      {!useEmbed && !apple ? (
        <div
          className={cn(
            "player-chrome z-20 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-200 sm:px-5",
            filled ? "absolute inset-x-0 bottom-0" : "relative",
          )}
          style={{ opacity: showChrome ? 1 : 0, pointerEvents: showChrome ? "auto" : "none" }}
        >
          <SeekBar current={current} duration={duration} buffered={buffered} onSeek={seek} />
          <div className="mt-3 flex items-center gap-1 sm:gap-2">
            <IconBtn label={playing ? "Pausa" : "Reproducir"} onClick={togglePlay}>
              {playing ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="ml-0.5 size-5 fill-current" />
              )}
            </IconBtn>
            <IconBtn
              label="Retroceder 10s"
              onClick={() => {
                const v = videoRef.current;
                if (v) v.currentTime = Math.max(0, v.currentTime - 10);
              }}
            >
              <SkipBack className="size-5" />
            </IconBtn>
            <IconBtn
              label="Adelantar 10s"
              onClick={() => {
                const v = videoRef.current;
                if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
              }}
            >
              <SkipForward className="size-5" />
            </IconBtn>
            <IconBtn
              label={muted ? "Activar sonido" : "Silenciar"}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
            >
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </IconBtn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              aria-label="Volumen"
              onChange={(e) => {
                const v = videoRef.current;
                const next = Number(e.target.value);
                setVolume(next);
                setMuted(next === 0);
                if (v) {
                  v.volume = next;
                  v.muted = next === 0;
                }
              }}
              className="hidden h-1 w-24 accent-primary sm:block"
            />
            <p className="ml-2 text-xs text-muted tabular-nums">
              {formatClock(current)} / {formatClock(duration)}
            </p>
            {subUrl ? (
              <IconBtn
                label={subsOn ? "Ocultar subtítulos" : "Subtítulos en español"}
                onClick={() => setSubsOn((v) => !v)}
              >
                <Subtitles className={subsOn ? "size-5" : "size-5 text-muted"} />
              </IconBtn>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function enterNativeFullscreen(
  shell: HTMLElement | null,
  video: HTMLVideoElement | null,
) {
  try {
    const host = shell as
      | (HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    const media = video as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;

    const request = host?.requestFullscreen?.bind(host) ?? host?.webkitRequestFullscreen?.bind(host);
    if (request) {
      await Promise.race([
        Promise.resolve(request()),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("fs-timeout")), 600)),
      ]);
      return;
    }
    media?.webkitEnterFullscreen?.();
  } catch {
    /* la vista previa y muchos iframes bloquean la API nativa */
  }
}

function isNativeFullscreen() {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

async function exitNativeFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (document.exitFullscreen && document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-12 place-items-center rounded-md text-fg hover:bg-elevated"
    >
      {children}
    </button>
  );
}

function SeekBar({
  current,
  duration,
  buffered,
  onSeek,
}: {
  current: number;
  duration: number;
  buffered: number;
  onSeek: (ratio: number) => void;
}) {
  const ratio = duration > 0 ? current / duration : 0;
  const buf = duration > 0 ? buffered / duration : 0;
  return (
    <button
      type="button"
      className="relative block h-8 w-full"
      aria-label="Posición"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-elevated">
        <span className="absolute inset-y-0 left-0 bg-subtle/50" style={{ width: `${buf * 100}%` }} />
        <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${ratio * 100}%` }} />
      </span>
    </button>
  );
}
