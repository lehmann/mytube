import { Router } from 'express';
import { spawn } from 'child_process';
import { FFMPEG, resolveFormat } from '../lib/resolveFormat.js';

const router = Router();

router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  let videoUrl, audioUrl;
  try {
    ({ videoUrl, audioUrl } = await resolveFormat(videoId));
  } catch (err) {
    console.error('[download] resolveFormat:', err.message);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[download] ${videoId} — iniciando ffmpeg`);

  // ffmpeg busca vídeo e áudio diretamente do CDN do YouTube em paralelo e já
  // começa a emitir fragmentos fMP4 nos primeiros segundos — sem buffer completo.
  const ffmpeg = spawn(FFMPEG, [
    '-i', videoUrl,
    '-i', audioUrl,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-bsf:a', 'aac_adtstoasc',   // AAC-ADTS → AAC-ASC exigido pelo MP4
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    '-loglevel', 'warning',
    'pipe:1',
  ]);

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Transfer-Encoding', 'chunked');

  ffmpeg.stdout.pipe(res);

  let totalBytes = 0;
  ffmpeg.stdout.on('data', (chunk) => { totalBytes += chunk.length; });

  ffmpeg.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[download/ffmpeg] ${line}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('[download] ffmpeg error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  ffmpeg.on('close', (code) => {
    const mb = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`[download] done ${videoId} — ${mb} MB — ffmpeg exit ${code}`);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => {
    ffmpeg.kill();
    console.log(`[download] aborted ${videoId}`);
  });
});

export default router;
