import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const YTDLP  = process.env.YTDLP_PATH  || 'yt-dlp';
export const FFMPEG = process.env.FFMPEG_PATH  || 'ffmpeg';

// Obrigatório desde yt-dlp 2026.8.19: sem runtime JS, YouTube rejeita decifragem de URL.
export const JS_RUNTIME_ARG = ['--js-runtimes', `node:${process.execPath}`];

const cache = new Map();
const TTL   = 55 * 60 * 1000; // 55 min — CDN URLs do YouTube expiram em ~6 h

function pickFormats(formats) {
  // Vídeo: H.264 ≤720p, apenas vídeo (sem áudio), URL direta https
  const vids = formats.filter(f =>
    f.protocol === 'https' &&
    f.vcodec && f.vcodec !== 'none' &&
    (!f.acodec || f.acodec === 'none') &&
    (f.height ?? 0) <= 720 &&
    f.url
  );

  const videoFormat =
    vids.filter(f => f.vcodec?.startsWith('avc1'))
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0] ??
    vids.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  // Áudio: AAC/m4a, apenas áudio, URL direta https
  const auds = formats.filter(f =>
    f.protocol === 'https' &&
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec && f.acodec !== 'none' &&
    f.url
  );

  const audioFormat =
    auds.filter(f => f.ext === 'm4a' || f.acodec?.startsWith('mp4a'))
        .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0] ??
    auds.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];

  return { videoFormat, audioFormat };
}

export async function resolveFormat(videoId) {
  const hit = cache.get(videoId);
  if (hit && hit.expiresAt > Date.now()) {
    console.log(`[resolveFormat] cache hit ${videoId} (${hit.height}p)`);
    return hit;
  }

  console.log(`[resolveFormat] yt-dlp --dump-json ${videoId}...`);
  const { stdout } = await execFileAsync(
    YTDLP,
    [...JS_RUNTIME_ARG, '--dump-json', '--no-playlist',
     `https://www.youtube.com/watch?v=${videoId}`],
    { timeout: 30_000 }
  );

  const info = JSON.parse(stdout);
  const { videoFormat, audioFormat } = pickFormats(info.formats ?? []);

  if (!videoFormat || !audioFormat) {
    const protocols = [...new Set((info.formats ?? []).map(f => f.protocol))];
    throw new Error(
      `Could not resolve DASH streams for ${videoId}. ` +
      `video=${!!videoFormat} audio=${!!audioFormat} protocols=${protocols.join(',')}`
    );
  }

  console.log(
    `[resolveFormat] ${videoId}: video=${videoFormat.format_id} ${videoFormat.height}p ` +
    `${videoFormat.vcodec} | audio=${audioFormat.format_id} ${audioFormat.acodec} ${audioFormat.abr}k`
  );

  const entry = {
    videoUrl: videoFormat.url,
    audioUrl: audioFormat.url,
    height:   videoFormat.height,
    expiresAt: Date.now() + TTL,
  };

  cache.set(videoId, entry);
  // Limpeza simples para evitar crescimento ilimitado
  if (cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expiresAt < now) cache.delete(k);
  }
  return entry;
}
