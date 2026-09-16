# CLAUDE.md — MyYouTube

## Comandos essenciais

```bash
npm run dev               # inicia servidor (3001) + cliente (5173)
npm run dev --workspace=server   # só o backend
npm run dev --workspace=client   # só o frontend
npm run build --workspace=client # build de produção
```

## Dependências externas obrigatórias

- **yt-dlp** — instalado via `pip3 install -U yt-dlp` ou `sudo curl -L ... -o /usr/local/bin/yt-dlp`
- **ffmpeg** — `apt install ffmpeg` (Ubuntu) / `brew install ffmpeg` (macOS)
- Ambos devem estar no `PATH`, ou configurados via variáveis de ambiente `YTDLP_PATH` e `FFMPEG_PATH`

## Arquitetura em uma linha

`youtube-sr` para busca → `yt-dlp` resolve e baixa video+audio separados → `ffmpeg` mescla em fMP4 fragmentado → browser reproduz via MSE enquanto o vídeo ainda está chegando → salva em IndexedDB ao terminar.

## Convenções do projeto

- **Sem TypeScript** — JavaScript puro (`.js` / `.jsx`)
- **Sem autenticação** — app pessoal, sem login, sem sessão
- **Sem comentários** salvo onde o motivo não é óbvio pelo código
- **CSS via Tailwind** com o prefixo de cor `yt-*` definido em `tailwind.config.js`

## Cache de vídeo — regras importantes

- Sempre usar **IndexedDB** (`client/src/services/videoCache.js`). Nunca `localStorage` para dados de vídeo.
- A store IndexedDB se chama `videos` no banco `myyoutube`.
- Estrutura de cada entrada: `{ data: Uint8Array, mimeType: string, cachedAt: number }`

## Fluxo do player (`VideoPlayer.jsx`) — MSE single-request

1. Checa IndexedDB → se existe, cria Blob URL e usa como `video.src` (seeking completo, offline)
2. Se não existe, cria um `MediaSource`, aponta `video.src` para o object URL
3. Faz um único fetch para `/api/download/:videoId` — os chunks alimentam o `SourceBuffer` em tempo real (reprodução) E são acumulados em memória
4. Ao terminar o fetch, chama `endOfStream()` e salva o Uint8Array completo no IndexedDB
5. Fallback: browsers sem suporte a `MediaSource` usam `src` direto para `/api/download/:videoId`

**Não há mais double-bandwidth**: uma única requisição serve tanto para reprodução imediata quanto para caching.

## Rotas do servidor

| Rota | Arquivo | Observação |
|---|---|---|
| `GET /api/search` | `server/routes/search.js` | parâmetros: `q`, `limit` |
| `GET /api/info/:videoId` | `server/routes/info.js` | metadados via yt-dlp `--dump-json` |
| `GET /api/stream/:videoId` | `server/routes/stream.js` | pipeline yt-dlp+ffmpeg, fMP4 chunked |
| `GET /api/download/:videoId` | `server/routes/download.js` | mesmo pipeline, usado pelo VideoPlayer via MSE |

## Pipeline yt-dlp + ffmpeg

```
yt-dlp -f "bestvideo[vcodec^=avc1][height<=720]...+bestaudio" -o - URL
    |
    v (MPEG-TS ou fMP4 parcial)
ffmpeg -i pipe:0 -c:v copy -c:a copy \
       -bsf:a aac_adtstoasc \           ← AAC-ADTS → AAC-ASC (exigido pelo MP4)
       -movflags frag_keyframe+empty_moov+default_base_moof \  ← fMP4 streamable
       -f mp4 pipe:1
    |
    v (chunked Transfer-Encoding)
browser (MSE SourceBuffer)
```

**`JS_RUNTIME_ARG`**: `--js-runtimes node:${process.execPath}` — obrigatório desde yt-dlp 2026.8.19 para que o yt-dlp encontre o Node.js e consiga decifrar URLs do YouTube. Exportado de `server/lib/resolveFormat.js`.

## Deploy (Ubuntu Server)

Todos os arquivos ficam em `deploy/`. O servidor usa Node.js 20 (NodeSource).

```
deploy/
├── setup.sh                  # provisionamento inicial — rodar uma vez como root
├── update.sh                 # atualização manual imediata
├── sync.sh                   # chamado pelo timer; não interativo
├── myyoutube-server.service  # systemd: backend Node.js
├── myyoutube-sync.service    # systemd: oneshot que executa sync.sh
├── myyoutube-sync.timer      # systemd: dispara sync.service a cada 10 min
└── nginx.conf                # reverse proxy + serve do client/dist
```

**Variáveis de ambiente (systemd):**
```
YTDLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg   # opcional se ffmpeg estiver no PATH
```

**nginx:** `proxy_buffering off` em `/api/stream/` e `/api/download/` é obrigatório — sem isso o nginx acumula o vídeo inteiro antes de enviar.

**Logs:**
```bash
journalctl -u myyoutube-server -f
journalctl -u myyoutube-sync   -f
systemctl list-timers myyoutube-sync.timer
```

## Armadilhas conhecidas

- **Formato combinado 18 foi removido**: YouTube não oferece mais streams mp4 combinados (video+audio) via `protocol=https`. Toda reprodução passa pelo pipeline yt-dlp+ffmpeg.
- **yt-dlp precisa de JS runtime**: desde 2026.8.19, yt-dlp exige `--js-runtimes node:PATH` ou deno para decifrar URLs. Sem isso, alguns vídeos não resolvem.
- **AAC-ADTS → ASC**: YouTube entrega áudio AAC em formato ADTS; MP4 exige ASC. O filtro `-bsf:a aac_adtstoasc` faz a conversão; sem ele o ffmpeg rejeita o stream de áudio.
- **youtube-sr pode quebrar**: o YouTube muda o scraping ocasionalmente. Se a busca parar de funcionar, verificar issues no repositório do `youtube-sr`.
- **Content-Length ausente no stream**: o servidor usa `Transfer-Encoding: chunked` sem `Content-Length` (tamanho do fMP4 não é conhecido a priori). A barra de progresso usa o header `content-length` quando disponível, mas pode não aparecer.
