import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { YTDLP, JS_RUNTIME_ARG } from '../lib/resolveFormat.js';

const execFileAsync = promisify(execFile);
const router = Router();

router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const { stdout } = await execFileAsync(
      YTDLP,
      [...JS_RUNTIME_ARG, '--dump-json', '--no-playlist', `https://www.youtube.com/watch?v=${videoId}`],
      { timeout: 30_000 }
    );

    const d = JSON.parse(stdout);

    // yt-dlp retorna upload_date como "YYYYMMDD"
    const publishDate = d.upload_date
      ? `${d.upload_date.slice(0, 4)}-${d.upload_date.slice(4, 6)}-${d.upload_date.slice(6, 8)}`
      : null;

    res.json({
      id: videoId,
      title: d.title,
      description: d.description ?? '',
      channel: d.uploader ?? d.channel ?? '',
      channelId: d.channel_url ?? null,
      thumbnail: d.thumbnail ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: d.duration ?? 0,
      views: d.view_count ?? 0,
      publishDate,
      keywords: d.tags ?? [],
    });
  } catch (err) {
    console.error('[info]', err.message);
    res.status(500).json({ error: 'Failed to get video info', message: err.message });
  }
});

export default router;
