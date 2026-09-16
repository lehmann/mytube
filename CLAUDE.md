# CLAUDE.md — MyYouTube

## Comandos essenciais

```bash
npm run dev               # inicia servidor (3001) + cliente (5173)
npm run dev --workspace=server   # só o backend
npm run dev --workspace=client   # só o frontend
npm run build --workspace=client # build de produção
```

## Restrição de ambiente

Node.js v18 — **não atualize** `@distube/ytdl-core` além de `4.14.x`; versões 4.16+ exigem Node 20+ (dependência `undici` v7). Se o ambiente for atualizado para Node 20, remova essa restrição no `server/package.json`.

## Arquitetura em uma linha

`youtube-sr` para busca → `@distube/ytdl-core` para resolver URL do CDN → proxy Express com range requests → cliente React faz streaming + download paralelo para IndexedDB.

## Convenções do projeto

- **Sem TypeScript** — JavaScript puro (`.js` / `.jsx`)
- **Sem autenticação** — app pessoal, sem login, sem sessão
- **Sem comentários** salvo onde o motivo não é óbvio pelo código
- **CSS via Tailwind** com o prefixo de cor `yt-*` definido em `tailwind.config.js`

## Cache de vídeo — regras importantes

- Sempre usar **IndexedDB** (`client/src/services/videoCache.js`). Nunca `localStorage` para dados de vídeo.
- A store IndexedDB se chama `videos` no banco `myyoutube`.
- Estrutura de cada entrada: `{ data: Uint8Array, mimeType: string, cachedAt: number }`
- O download de cache é feito em paralelo ao streaming (segundo fetch), não antes.

## Fluxo do player (`VideoPlayer.jsx`)

1. Checa IndexedDB → se existe, cria Blob URL e usa como `video.src`
2. Se não existe, aponta `video.src` para `/api/stream/:videoId` e dispara download em background
3. Ao terminar o download, salva no IndexedDB e atualiza indicador de status

## Rotas do servidor

| Rota | Arquivo | Observação |
|---|---|---|
| `GET /api/search` | `server/routes/search.js` | parâmetros: `q`, `limit` |
| `GET /api/info/:videoId` | `server/routes/info.js` | metadados via ytdl-core |
| `GET /api/stream/:videoId` | `server/routes/stream.js` | proxy com cache de URL (55 min TTL) |

## Armadilhas conhecidas

- **URLs do CDN expiram**: o `stream.js` mantém um `Map` em memória com TTL de 55 min. Se o servidor ficar muito tempo rodando e o cache expirar durante uma reprodução, o cliente pode receber 502 — basta recarregar.
- **Formato máximo 720p**: ytdl-core + `filter: 'audioandvideo'` retorna streams mesclados, que o YouTube oferece até 720p. Para 1080p+ seria necessário mesclar streams separados com ffmpeg.
- **youtube-sr pode quebrar**: o YouTube muda o scraping ocasionalmente. Se a busca parar de funcionar, verificar issues no repositório do `youtube-sr`.
- **Arquivos `[0-9]*-base.js`**: gerados pelo ytdl-core em tempo de execução no diretório de trabalho. Ignorados pelo `.gitignore`.
