# 🎌 Anime Tierlist Live

Uma **webapp** para fazeres tierlists de anime **com os teus colegas, em tempo real**: pesquisas qualquer anime, arrastas para o tier certo e cada um dá a sua **nota**, **opinião** e **recomendação**. Toda a gente vê o que os outros estão a fazer ao vivo: cursores, cartas a serem arrastadas, quem está a escrever, chat e atividade.

Não é preciso criar conta: crias uma sala, partilhas o link (ou o QR code) e pronto.

---

## ✨ Funcionalidades

**Catálogo completo de anime**
- Pesquisa em **todo** o catálogo do [AniList](https://anilist.co) (dezenas de milhares de títulos), com scroll infinito.
- Filtros por género, ano, temporada e formato, e atalhos para "Em alta", "Esta temporada", "Melhores de sempre" e "Mais populares".
- Se o AniList estiver em baixo ou a limitar pedidos, a app passa sozinha para o **MyAnimeList** (através da API [Jikan](https://jikan.moe)).
- Detalhes de cada anime: sinopse, episódios, estúdio, trailer e animes semelhantes.

**Tierlists**
- **Grupo**: uma tierlist partilhada onde todos arrastam animes ao mesmo tempo.
- **A minha**: cada pessoa tem a sua tierlist pessoal, que todos podem ver em direto.
- **Média**: gerada automaticamente a partir das tierlists pessoais de todos (o consenso da turma).
- Arrastar e largar com o rato ou com o dedo (toque longo no telemóvel). Também podes mover pelo detalhe do anime.
- Tiers personalizáveis (nomes, cores, ordem e modelos como "🐐 GOAT / 🔥 Top / 💀 Lixo").
- Exportar qualquer tierlist como **imagem PNG** para partilhar.

**Opiniões**
- Nota de **1 a 10**, **recomendação** (👍 Recomendo / 🤔 Talvez / 👎 Não recomendo), **estado** (Já vi, A ver, Quero ver, Desisti) e **opinião escrita**, gravada automaticamente.
- **Ranking** da sala: melhores notas, mais avaliados, mais recomendados e mais polémicos.
- **Recomendados para ti**: animes que os colegas recomendam e que tu ainda não viste.
- **Membros**: estatísticas de cada um, géneros favoritos e **afinidade de gostos** contigo.

**Tempo real**
- Quem está online e o que está a fazer ("A mover Frieren", "A escrever sobre One Piece"…).
- Os **cursores** dos colegas na tierlist.
- Quando alguém arrasta uma carta, vês a carta marcada com o nome da pessoa e o sítio onde a vai largar.
- Aviso "está a escrever…" nas opiniões e no chat.
- **Chat** da sala e **feed de atividade**.
- As alterações aparecem logo no teu ecrã e sincronizam com os outros em milissegundos. Se perderes a ligação, o que fizeres é enviado quando voltar.

Funciona em computador e telemóvel.

---

## 🚀 Começar (no teu computador)

Precisas do [Node.js](https://nodejs.org) **22** (ou 20.19+).

```bash
npm install
npm run dev
```

Abre **http://localhost:3000**, escreve o teu nome, cria uma sala e carrega em **Convidar** para partilhar o link.

Para correr em modo de produção (mais rápido):

```bash
npm run build
npm start
```

---

## 👥 Jogar com os colegas

O servidor tem de estar acessível a todos. Tens três opções, da mais rápida à mais permanente.

### 1. Mesma rede Wi-Fi

Quando arrancas o servidor, ele mostra um endereço **Rede local** (por exemplo `http://192.168.1.23:3000`). Envia esse link, ou o do botão **Convidar**, a quem estiver na mesma rede. Mesmo que tenhas aberto a app em `localhost`, o **Convidar** já usa o endereço da tua rede.

### 2. Pela internet em 1 minuto (grátis, sem conta)

Com o servidor a correr, instala o [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (no Windows: `winget install --id Cloudflare.cloudflared`) e, noutra janela do terminal, faz:

```bash
cloudflared tunnel --url http://localhost:3000
```

Recebes um link `https://….trycloudflare.com` para enviar aos colegas. Funciona enquanto o teu PC estiver ligado, e as salas ficam guardadas na pasta `data/`. Para os colegas carregarem a app mais depressa, usa `npm run build` e `npm start` em vez de `npm run dev`.

### Os colegas não conseguem entrar?

1. **Link errado.** Não envies links com `localhost`, nem os endereços que o terminal marca como `(virtual)`, por exemplo `192.168.56.1` (VirtualBox). Esses não funcionam noutros computadores. Usa o link do botão **Convidar**.
2. **Redes diferentes.** Os colegas têm de estar na mesma rede Wi-Fi que o teu PC. Testa primeiro com o teu telemóvel.
3. **Firewall do Windows.** Abre o PowerShell **como administrador** e corre:
   ```powershell
   New-NetFirewallRule -DisplayName "Anime Tierlist" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```
   Em casa, também podes pôr a rede Wi-Fi como **Privada**: *Definições → Rede e Internet → Wi-Fi → (a tua rede) → Tipo de perfil de rede*.
4. **Rede da escola ou universidade** (por exemplo, eduroam). Estas redes costumam bloquear ligações entre computadores. Usa o túnel da opção 2.

### 3. Alojar online (sempre disponível)

| Onde | Como | Custo |
|---|---|---|
| **Railway** | *New Project → Deploy from GitHub repo*. Adiciona um **Volume** montado em `/data` e a variável `DATA_DIR=/data`. | Período de teste; depois ~5 USD/mês |
| **Render + Neon** | Cria uma base de dados PostgreSQL grátis no [Neon](https://neon.tech) e copia a *connection string*. No [Render](https://render.com) escolhe *New → Blueprint* com este repositório (usa o `render.yaml`) e cola a string em `DATABASE_URL`. | Grátis (o Render adormece após 15 min sem uso; o primeiro acesso demora ~1 min) |
| **Docker / VPS** | `docker build -t anime-tierlist .` e `docker run -d -p 3000:3000 -v tierlist-data:/data anime-tierlist` | Depende do servidor |

> Os planos grátis sem disco persistente (como o do Render) apagam os ficheiros quando reiniciam. Nesses casos usa sempre `DATABASE_URL` (PostgreSQL). Como estudante, o [GitHub Student Developer Pack](https://education.github.com/pack) também te dá créditos em vários serviços de alojamento.

---

## 💾 Onde ficam guardadas as coisas

**Por omissão, tudo fica guardado automaticamente** na pasta `data/rooms/` do projeto, com um ficheiro por sala. Isto aguenta reinícios do servidor e do PC. Para fazer uma cópia de segurança, copia essa pasta.

### Usar uma base de dados PostgreSQL (grátis, no Neon)

Faz sentido se quiseres os dados fora do teu PC, ou para mais tarde pores o site online.

1. Cria uma conta em [neon.tech](https://neon.tech) (grátis, sem cartão) e cria um projeto. Escolhe a região *Europe (Frankfurt)*, que fica mais perto.
2. No painel do projeto carrega em **Connect** e copia a *connection string*. É parecida com:
   `postgresql://neondb_owner:…@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Na pasta do projeto, copia o `.env.example` para um ficheiro chamado **`.env`** e cola o link:
   ```
   DATABASE_URL=postgresql://neondb_owner:…@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Reinicia o servidor. O terminal deve mostrar `Dados: PostgreSQL (ep-xxxx…neon.tech)`. As salas que já tinhas na pasta `data/` são **copiadas automaticamente** para a base de dados na primeira vez.

Para ver os dados, abre o **SQL Editor** do Neon e corre:
```sql
SELECT id, doc->'state'->>'name' AS sala, updated_at FROM rooms;
```

> O ficheiro `.env` tem a password da base de dados: não o partilhes. Já está no `.gitignore`, por isso não vai para o GitHub. Para voltares a guardar em ficheiros, apaga a linha `DATABASE_URL` do `.env`.

---

## ⚙️ Configuração

Todas as variáveis são opcionais. Podes pô-las num ficheiro **`.env`** na pasta do projeto (vê o `.env.example`), que o servidor lê ao arrancar, ou defini-las como variáveis de ambiente.

| Variável | Por omissão | Para que serve |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface onde o servidor escuta |
| `DATA_DIR` | `./data` | Pasta onde as salas são guardadas (um ficheiro JSON por sala) |
| `DATABASE_URL` | — | Se definida, as salas são guardadas em **PostgreSQL** em vez de ficheiros (Neon, Supabase, Railway…) |
| `TRUST_PROXY` | redes privadas | Definição `trust proxy` do Express, para obter o IP real atrás de um proxy |

---

## 🧠 Como funciona

```mermaid
flowchart LR
  subgraph B["Browser de cada colega"]
    UI["React + dnd-kit"] --> RC["RoomClient<br/>(atualizações otimistas)"]
  end
  UI -- pesquisa --> AL[("AniList GraphQL")]
  UI -. "se o AniList falhar" .-> JK[("Jikan / MyAnimeList")]
  RC <-- "Socket.IO (WebSocket)" --> S["Servidor Node.js<br/>Express + Socket.IO"]
  S --> DB[("JSON em ./data<br/>ou PostgreSQL")]
```

- **Operações partilhadas.** Cada alteração é uma *operação* (por exemplo `board.move`: "pôr Frieren no tier S da tierlist do Grupo"). O mesmo código, `src/shared/ops.ts`, aplica as operações no servidor **e** no browser, por isso todos chegam exatamente ao mesmo estado.
- **Otimista.** O browser aplica a tua operação na hora e envia-a ao servidor. O servidor valida-a (com `zod`), aplica-a, dá-lhe um número de sequência e envia-a a toda a gente. Se for recusada (por exemplo, mexer na tierlist pessoal de outra pessoa), o browser desfaz. Se faltar alguma operação, o browser pede o estado completo.
- **Presença.** Cursores, cartas a ser arrastadas, "está a escrever…" e quem está a ver o quê são mensagens efémeras: não ficam guardadas.
- **Persistência.** Cada sala ativa vive em memória no servidor e é gravada cerca de 1 segundo depois de cada alteração: um ficheiro JSON por sala, ou uma linha JSONB em PostgreSQL.
- **Identidade sem contas.** O browser gera um id e um segredo aleatórios (guardados em `localStorage`). O servidor guarda só o *hash* do segredo, para ninguém se fazer passar por ti. No teu perfil há um link para usares a mesma identidade noutro dispositivo.
- **Anime.** As pesquisas vão diretamente do browser ao AniList, por isso cada pessoa tem o seu próprio limite de pedidos. Quando se adiciona um anime à sala, os dados principais (título, capa, género…) ficam guardados na sala.

### Estrutura do projeto

```
src/
  shared/        código usado pelo servidor e pelo browser
    types.ts     tipos (sala, anime, avaliação, presença…)
    ops.ts       reducer das operações (a lógica central)
    schema.ts    validação de tudo o que o servidor recebe
    stats.ts     médias, tierlist "Média", afinidade, recomendações
  server/
    index.ts     arranque do servidor
    app.ts       Express + Socket.IO (+ Vite em desenvolvimento)
    realtime.ts  eventos em tempo real (entrar, operações, presença, cursores)
    rooms.ts     salas em memória, gravação e autenticação
    http.ts      API REST (criar sala, info, proxy de imagens para o PNG)
    storage/     gravação em ficheiros JSON ou PostgreSQL
  client/
    lib/         API de anime, ligação à sala, perfil, exportar PNG…
    components/  interface (tierlist, explorar, ranking, membros, chat…)
tests/           testes unitários, de integração e E2E (Playwright)
```

---

## 🧪 Testes

```bash
npm test               # testes unitários e de integração (Vitest), incluindo o servidor em tempo real
npm run typecheck      # verificação de tipos (TypeScript)
npm run build && npm run test:e2e   # dois browsers a usar a mesma sala (Playwright)
```

- Os testes E2E simulam a API do AniList, por isso correm sem internet. Na primeira vez instala o browser com `npx playwright install chromium`.
- Para testar também a gravação em PostgreSQL: `TEST_DATABASE_URL=postgres://utilizador:senha@localhost:5432/base npm test`.

---

## 💡 Ideias para continuar

- Salas com palavra-passe e moderação (expulsar membros).
- Recomendar um anime diretamente a um colega, com notificação.
- Modo "votação": um anime de cada vez e cada pessoa vota o tier.
- Tema claro.

---

Dados de anime fornecidos pelo [AniList](https://anilist.co) e pelo [MyAnimeList](https://myanimelist.net) (via [Jikan](https://jikan.moe)). Este projeto não é afiliado a nenhum destes serviços.
