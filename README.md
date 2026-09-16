# MyTube

Web app pessoal que funciona como intermediário para o YouTube: permite buscar e assistir vídeos com uma interface limpa (sem login, sem recomendações algorítmicas, sem anúncios) e armazena os vídeos assistidos no próprio browser para replay offline.

## Funcionalidades

- **Busca** de vídeos via YouTube (sem API key)
- **Streaming** via proxy no servidor — resolve a URL direta no CDN do YouTube e repassa com suporte a range requests (seeking funciona)
- **Cache local** em IndexedDB: na primeira reprodução o vídeo é baixado em background e salvo; nas reproduções seguintes é servido diretamente do cache (acesso instantâneo, sem internet)
- Indicador de status de cache por vídeo (streaming → salvando % → armazenado X MB)
- Botão para remover vídeo do cache

## Requisitos

- **Node.js** >= 14 (testado em v18)
- npm >= 9

> **Node 20+:** se você tiver Node 20 ou superior, pode atualizar `@distube/ytdl-core` para a versão mais recente (`^4.16`) no `server/package.json` para melhor compatibilidade com o YouTube.

## Instalação

```bash
git clone <repo>
cd mytube
npm install
```

## Execução

```bash
npm run dev
```

Isso inicia os dois processos em paralelo:

| Processo | URL |
|---|---|
| Frontend (Vite + React) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |

O Vite proxeia automaticamente chamadas `/api/*` para o backend em desenvolvimento.

## Estrutura

```
mytube/
├── package.json          # workspace root (npm workspaces)
├── server/
│   ├── index.js          # Express app
│   └── routes/
│       ├── search.js     # GET /api/search?q=&limit=
│       ├── info.js       # GET /api/info/:videoId
│       └── stream.js     # GET /api/stream/:videoId
└── client/
    ├── vite.config.js
    └── src/
        ├── pages/
        │   ├── Home.jsx  # página de busca
        │   └── Watch.jsx # player + info + relacionados
        ├── components/
        │   ├── Header.jsx
        │   ├── VideoCard.jsx
        │   ├── VideoGrid.jsx
        │   └── VideoPlayer.jsx
        └── services/
            ├── api.js        # funções de fetch e formatação
            └── videoCache.js # leitura/escrita no IndexedDB
```

## API do servidor

### `GET /api/search`

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `q` | string | — | Termo de busca (obrigatório) |
| `limit` | number | 24 | Máximo de resultados |

Retorna `{ videos: [{ id, title, thumbnail, channel, duration, views, uploadedAt }] }`.

### `GET /api/info/:videoId`

Retorna metadados completos do vídeo: título, descrição, canal, duração, visualizações, thumbnail, keywords.

### `GET /api/stream/:videoId`

Proxy do vídeo com suporte a `Range` requests. O servidor resolve a URL do CDN do YouTube via ytdl-core, mantém essa URL em cache por 55 minutos e repassa as requisições do browser diretamente ao CDN.

**Formato:** o ytdl-core escolhe o melhor formato `audioandvideo` disponível (geralmente até 720p em MP4). Formatos de maior resolução (1080p+) no YouTube têm áudio e vídeo em streams separados — mesclar exigiria ffmpeg.

## Cache local

O cache usa a [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) do browser (via biblioteca `idb`), não `localStorage`.

| | localStorage | IndexedDB |
|---|---|---|
| Tipo de dado | string | qualquer (incluindo ArrayBuffer) |
| Limite típico | 5–10 MB | centenas de MB a vários GB |
| Adequado para vídeo | não | sim |

O banco se chama `mytube`, store `videos`. Cada entrada é `{ data: Uint8Array, mimeType: string, cachedAt: timestamp }`.

## Notas técnicas

- `youtube-sr` faz scraping da busca do YouTube sem precisar de API key; é frágil a mudanças no YouTube.
- `@distube/ytdl-core` é o fork mantido do `ytdl-core` original. Fixado em `4.14.4` por compatibilidade com Node 18.
- Na primeira reprodução o vídeo toca via streaming enquanto um segundo fetch o baixa inteiro para o cache — há uso duplo de banda nessa ocasião.
