import type { StreamInfo } from "@/lib/archive";

type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: {
    framework?: {
      CastContext: {
        getInstance: () => {
          setOptions: (opts: Record<string, unknown>) => void;
          getCurrentSession: () => CastSession | null;
          requestSession: () => Promise<void>;
        };
      };
    };
  };
  chrome?: {
    cast?: {
      AutoJoinPolicy?: { ORIGIN_SCOPED: string };
      media?: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (url: string, type: string) => {
          metadata: unknown;
          streamType: string;
        };
        GenericMediaMetadata: new () => { title?: string; images?: { url: string }[] };
        StreamType: { BUFFERED: string };
        LoadRequest: new (info: unknown) => { currentTime: number; autoplay: boolean };
      };
    };
  };
};

type CastSession = {
  loadMedia: (req: unknown) => Promise<void>;
};

type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  remote?: { prompt: () => Promise<void>; state?: string };
};

export function castableUrl(stream: StreamInfo) {
  if (/\.mp4(\?|$)/i.test(stream.url)) return stream.url;
  if (stream.fallbackUrl && /\.mp4(\?|$)/i.test(stream.fallbackUrl)) return stream.fallbackUrl;
  return stream.url;
}

export function watchUrl(slug: string, pista = "es") {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/ver/${encodeURIComponent(slug)}?pista=${encodeURIComponent(pista)}`;
}

export function tvSalaUrl() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/tv`;
}

function castWin() {
  return window as CastWindow;
}

export async function promptAirPlay(video: HTMLVideoElement | null) {
  const media = video as AirPlayVideo | null;
  if (!media) return false;
  try {
    if (typeof media.webkitShowPlaybackTargetPicker === "function") {
      media.webkitShowPlaybackTargetPicker();
      return true;
    }
    if (media.remote && typeof media.remote.prompt === "function") {
      await media.remote.prompt();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

let castReady: Promise<boolean> | null = null;

export function loadCastSender() {
  if (castReady) return castReady;
  castReady = new Promise((resolve) => {
    const w = castWin();
    if (w.cast?.framework) {
      resolve(true);
      return;
    }
    w.__onGCastApiAvailable = (ok) => resolve(Boolean(ok && w.cast?.framework));
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
    window.setTimeout(() => resolve(Boolean(w.cast?.framework)), 8000);
  });
  return castReady;
}

export async function castToScreen(opts: {
  url: string;
  title: string;
  poster?: string;
  currentTime?: number;
}) {
  const ok = await loadCastSender();
  const w = castWin();
  const chromeCast = w.chrome?.cast;
  const framework = w.cast?.framework;
  if (!ok || !chromeCast?.media || !framework) return false;

  const ctx = framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chromeCast.AutoJoinPolicy?.ORIGIN_SCOPED,
  });

  if (!ctx.getCurrentSession()) {
    await ctx.requestSession();
  }
  const session = ctx.getCurrentSession();
  if (!session) return false;

  const type = /\.webm(\?|$)/i.test(opts.url) ? "video/webm" : "video/mp4";
  const info = new chromeCast.media.MediaInfo(opts.url, type);
  const meta = new chromeCast.media.GenericMediaMetadata();
  meta.title = opts.title;
  if (opts.poster) meta.images = [{ url: opts.poster }];
  info.metadata = meta;
  info.streamType = chromeCast.media.StreamType.BUFFERED;
  const request = new chromeCast.media.LoadRequest(info);
  request.currentTime = opts.currentTime ?? 0;
  request.autoplay = true;
  await session.loadMedia(request);
  return true;
}

export async function sendToTv(opts: {
  video: HTMLVideoElement | null;
  stream: StreamInfo;
  title: string;
  poster?: string;
}) {
  const url = castableUrl(opts.stream);
  const video = opts.video;
  if (video && url && !video.currentSrc.includes(url.split("/").pop() ?? url)) {
    const time = video.currentTime;
    const wasPaused = video.paused;
    video.src = url;
    video.currentTime = time;
    if (!wasPaused) void video.play().catch(() => undefined);
  }

  if (await promptAirPlay(video)) return "picker" as const;

  try {
    const sent = await castToScreen({
      url,
      title: opts.title,
      poster: opts.poster,
      currentTime: video?.currentTime ?? 0,
    });
    if (sent) {
      video?.pause();
      return "cast" as const;
    }
  } catch {
    /* sin Chromecast a mano, o el usuario canceló */
  }
  return "none" as const;
}
