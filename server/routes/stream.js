import { Router } from 'express';
import ytdl from '@distube/ytdl-core';
import https from 'https';
import http from 'http';

const router = Router();

// Cache resolved format URLs to avoid re-fetching info on every range request
const formatCache = new Map();
const FORMAT_TTL = 55 * 60 * 1000; // 55 minutes (YouTube URLs typically valid ~6h)

async function resolveFormat(videoId) {
  const cached = formatCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestvideo',
    filter: 'audioandvideo',
  });

  if (!format) throw new Error('No audioandvideo format found');

  const entry = {
    url: format.url,
    mimeType: format.mimeType ?? 'video/mp4',
    contentLength: format.contentLength ?? null,
    expiresAt: Date.now() + FORMAT_TTL,
  };

  formatCache.set(videoId, entry);

  // Clean old entries
  if (formatCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of formatCache) {
      if (v.expiresAt < now) formatCache.delete(k);
    }
  }

  return entry;
}

router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const { url: cdnUrl, mimeType, contentLength } = await resolveFormat(videoId);

    const proxyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
    };

    if (req.headers.range) {
      proxyHeaders['Range'] = req.headers.range;
    }

    const lib = cdnUrl.startsWith('https') ? https : http;
    const proxyReq = lib.get(cdnUrl, { headers: proxyHeaders }, (proxyRes) => {
      const outHeaders = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      };

      if (proxyRes.headers['content-length']) {
        outHeaders['Content-Length'] = proxyRes.headers['content-length'];
      } else if (contentLength && !req.headers.range) {
        outHeaders['Content-Length'] = contentLength;
      }

      if (proxyRes.headers['content-range']) {
        outHeaders['Content-Range'] = proxyRes.headers['content-range'];
      }

      res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
      proxyRes.pipe(res);

      proxyRes.on('error', (err) => {
        console.error('[stream proxy]', err.message);
        if (!res.writableEnded) res.end();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[stream proxyReq]', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Upstream error' });
    });

    req.on('close', () => proxyReq.destroy());
  } catch (err) {
    console.error('[stream]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

export default router;
