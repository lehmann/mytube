import { Router } from 'express';
import ytdl from '@distube/ytdl-core';

const router = Router();

router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
    const d = info.videoDetails;

    res.json({
      id: videoId,
      title: d.title,
      description: d.description ?? '',
      channel: d.author.name,
      channelId: d.author.channel_url ?? null,
      thumbnail: d.thumbnails[d.thumbnails.length - 1]?.url ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: parseInt(d.lengthSeconds, 10),
      views: parseInt(d.viewCount, 10),
      publishDate: d.publishDate ?? null,
      keywords: d.keywords ?? [],
    });
  } catch (err) {
    console.error('[info]', err.message);
    res.status(500).json({ error: 'Failed to get video info', message: err.message });
  }
});

export default router;
