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
  Tv,
  Loader2,
} from "lucide-react";
import {
  devicePrefersMp4,
  knownArchiveStream,
  playbackStream,
  resolveStream,
  resolveStreamClient,
  warmupPlayback,
  type StreamInfo,
} from "@/lib/archive";
import { type Film } from "@/lib/catalog";
import { langInfo } from "@/lib/languages";
import { useLibrary } from "@/lib/library";
import { useGeneratedCaptions } from "@/lib/use-captions";
import { BUFFER_RESUME, BUFFER_STALL, bufferAhead, readBufferRanges, type BufferRange } from "@/lib/buffer";
import { cn, formatClock } from "@/lib/utils";
import { TvPanel } from "@/components/tv-panel";

export function Player({ film, pista = "es" }: { film: Film; pista?: "es" | "original" | "subs" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const lang = langInfo(film);
  const useBurned = pista === "subs" && Boolean(lang.esArchiveId);
  const playId = useBurned ? (lang.esArchiveId as string) : film.archiveId;
  const officialSubUrl = useBurned ? undefined : lang.subUrl;
  const canGenerate = !officialSubUrl && !useBurned;
  const generated = useGeneratedCaptions(film, canGenerate);
  const subUrl = officialSubUrl ?? generated.url ?? undefined;
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
  const [ranges, setRanges] = useState<BufferRange[]>([]);
  const [ahead, setAhead] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [filled, setFilled] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false);
  const [subsOn, setSubsOn] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const saveProgress = useLibrary((s) => s.saveProgress);
  const existing = useLibrary((s) => s.progress[film.id]);
  const stallOwn = useRef(false);
  const userPaused = useRef(false);
  const resumeDone = useRef(false);
  const existingRef = useRef(existing);
  existingRef.current = existing;

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
      setHasFrame(false);
      setStalled(false);
      resumeDone.current = false;
      userPaused.current = false;
      stallOwn.current = false;
      return;
    }
    setLoading(true);
    setHasFrame(false);
    setStalled(false);
    resumeDone.current = false;
    userPaused.current = false;
    stallOwn.current = false;
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
    if (stream?.url) warmupPlayback(stream.url);
  }, [stream?.url]);

  useEffect(() => {
    if (!stream || useEmbed) return;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      const next = readBufferRanges(v.buffered);
      const nextAhead = bufferAhead(next, v.currentTime);
      setRanges(next);
      setAhead(nextAhead);

      if (!hasFrame || userPaused.current || v.seeking || v.ended) return;
      if (!v.paused && nextAhead < BUFFER_STALL) {
        stallOwn.current = true;
        v.pause();
        setStalled(true);
        return;
      }
      if (stallOwn.current && nextAhead >= BUFFER_RESUME) {
        stallOwn.current = false;
        setStalled(false);
        void v.play().catch(() => undefined);
      }
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [stream, useEmbed, hasFrame]);

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
    v.setAttribute("x-webkit-airplay", "allow");
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
    if (v.paused) {
      userPaused.current = false;
      stallOwn.current = false;
      setStalled(false);
      void startPlayback();
    } else {
      userPaused.current = true;
      stallOwn.current = false;
      setStalled(false);
      v.pause();
    }
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

  const applyResumeIfNeeded = () => {
    const v = videoRef.current;
    if (!v || resumeDone.current) return false;
    const resume = existingRef.current?.seconds ?? 0;
    if (resume > 8 && Math.abs(v.currentTime - resume) > 2) {
      resumeDone.current = true;
      v.currentTime = resume;
      return true;
    }
    resumeDone.current = true;
    return false;
  };

  const onReadyToPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    if (v.readyState >= 2) setLoading(false);
    if (applyResumeIfNeeded()) return;
    if (!userPaused.current && v.paused) void startPlayback();
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
    if (apple) {
      v.muted = true;
      setMuted(true);
    }
    onReadyToPlay();
  };

  const onTime = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    const next = readBufferRanges(v.buffered);
    setRanges(next);
    setAhead(bufferAhead(next, v.currentTime));
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
            {generated.progress
              ? generated.progress.phase === "translate"
                ? ` · Traduciendo ${generated.progress.done}/${generated.progress.total}`
                : generated.progress.phase === "transcribe"
                  ? ` · Transcribiendo ${generated.progress.done}/${generated.progress.total}`
                  : " · Escuchando el audio…"
              : null}
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
        {canGenerate && !generated.ready ? (
          <button
            type="button"
            aria-label="Generar subtítulos en español"
            disabled={generated.busy}
            onClick={(e) => {
              e.stopPropagation();
              void generated.generate();
            }}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-elevated px-3 text-sm font-medium text-fg ring-1 ring-border sm:px-4 disabled:opacity-70"
          >
            {generated.busy ? <Loader2 className="size-4 animate-spin" /> : <Subtitles className="size-4" />}
            <span className="hidden sm:inline">{generated.busy ? "Generando…" : "Generar subtítulos ES"}</span>
            <span className="sm:hidden">{generated.busy ? "…" : "Subs ES"}</span>
          </button>
        ) : null}
        {apple && subUrl ? (
          <button
            type="button"
            aria-label={subsOn ? "Ocultar subtítulos" : "Subtítulos en español"}
            onClick={(e) => {
              e.stopPropagation();
              setSubsOn((v) => !v);
            }}
            className="grid size-12 shrink-0 place-items-center rounded-md bg-elevated text-fg ring-1 ring-border"
          >
            <Subtitles className={subsOn ? "size-5" : "size-5 text-muted"} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Ver en la tele"
          onClick={(e) => {
            e.stopPropagation();
            setTvOpen(true);
          }}
          className="grid size-12 shrink-0 place-items-center rounded-md bg-elevated text-fg ring-1 ring-border"
        >
          <Tv className="size-5" />
        </button>
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
              disableRemotePlayback={false}
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
                if (!stallOwn.current) setStalled(false);
              }}
              onPause={() => {
                setPlaying(false);
                setChrome(true);
                const v = videoRef.current;
                if (v && !stallOwn.current) {
                  saveProgress({ slug: film.id, seconds: v.currentTime, duration: v.duration || 0 });
                }
              }}
              onLoadedMetadata={onLoaded}
              onCanPlay={onReadyToPlay}
              onSeeked={onReadyToPlay}
              onProgress={onTime}
              onTimeUpdate={onTime}
              onWaiting={() => {
                if (!hasFrame) setLoading(true);
                else setStalled(true);
              }}
              onPlaying={() => {
                setHasFrame(true);
                setLoading(false);
                if (!stallOwn.current) setStalled(false);
              }}
              onStalled={() => {
                if (hasFrame) setStalled(true);
              }}
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
                <track
                  key={subUrl}
                  kind="subtitles"
                  src={subUrl}
                  srcLang="es"
                  label="Español"
                  default={subsOn}
                />
              ) : null}
            </video>
          ) : null}

          {loading && !hasFrame && !error && !useEmbed ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
              <div className="text-center">
                <div className="mx-auto size-10 animate-spin rounded-full border-2 border-border border-t-primary" />
                <p className="mt-4 text-sm text-muted">Arrancando los primeros segundos…</p>
              </div>
            </div>
          ) : null}

          {stalled && hasFrame && !useEmbed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-bg/75 px-4 py-2 text-center text-xs text-muted">
              Llenando el buffer · {Math.max(0, Math.round(ahead))} s listos
            </div>
          ) : null}

          {generated.progress ? (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-bg/80 px-4 py-3 text-center text-sm text-fg">
              {generated.progress.phase === "translate"
                ? `Traduciendo al español ${generated.progress.done} / ${generated.progress.total}`
                : generated.progress.phase === "transcribe"
                  ? `Transcribiendo el audio ${generated.progress.done} / ${generated.progress.total}`
                  : "Escuchando la pista de audio…"}
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
          <SeekBar current={current} duration={duration} ranges={ranges} onSeek={seek} />
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
              {ahead > 1 ? (
                <span className="ml-2 text-subtle">· {Math.round(ahead)} s por delante</span>
              ) : null}
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

      {tvOpen ? (
        <TvPanel
          film={film}
          pista={pista}
          stream={stream}
          video={videoRef.current}
          onClose={() => setTvOpen(false)}
        />
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
  ranges,
  onSeek,
}: {
  current: number;
  duration: number;
  ranges: BufferRange[];
  onSeek: (ratio: number) => void;
}) {
  const ratio = duration > 0 ? current / duration : 0;
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
        {ranges.map((range) => (
          <span
            key={`${range.start}-${range.end}`}
            className="absolute inset-y-0 bg-subtle/55"
            style={{
              left: `${duration > 0 ? (range.start / duration) * 100 : 0}%`,
              width: `${duration > 0 ? ((range.end - range.start) / duration) * 100 : 0}%`,
            }}
          />
        ))}
        <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${ratio * 100}%` }} />
      </span>
    </button>
  );
}
