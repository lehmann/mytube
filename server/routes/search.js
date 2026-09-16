import { Router } from 'express';
import YouTube from 'youtube-sr';

const router = Router();

router.get('/', async (req, res) => {
  const { q, limit = '24' } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const results = await YouTube.default.search(q.trim(), {
      limit: parseInt(limit, 10),
      type: 'video',
    });

    const videos = results.map((v) => ({
      id: v.id,
      title: v.title,
      thumbnail: v.thumbnail?.url ?? `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
      channel: v.channel?.name ?? 'Unknown',
      channelId: v.channel?.id ?? null,
      duration: v.durationFormatted ?? null,
      views: v.views ?? 0,
      uploadedAt: v.uploadedAt ?? null,
    }));

    res.json({ videos });
  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

export default router;
