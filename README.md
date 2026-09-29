# 🎬 LusiMovies

Uma **webapp** para os colaboradores do **Grupo Lusiaves** partilharem o que andam a ver: **filmes, séries e anime**. O site abre na **Comunidade**, um espaço de toda a gente, sem salas: cada pessoa adiciona títulos, põe-nos na sua tierlist e dá a sua **nota**, **opinião** e **recomendação**, e todos veem as dos outros, ao vivo. A tierlist da Comunidade é a média das tierlists de todos. Para grupos mais pequenos (uma equipa, um turno), há as **Salas**.

Não é obrigatório criar conta: crias uma sala, partilhas o link (ou o QR code) e pronto. Com uma **conta** (utilizador e palavra-passe) és sempre a mesma pessoa, em qualquer link ou dispositivo, e ficas com a lista das tuas salas.

---

## ✨ Funcionalidades

**Filmes, séries e anime**
- Ao criar uma sala escolhes o que vão classificar: **Tudo** (filmes, séries e anime na mesma tierlist, a opção por omissão), **Filmes**, **Séries** ou **Anime**. O dono da sala pode mudar o tipo depois, no cabeçalho da sala ou em "Explorar".
- **Filmes e séries**: catálogo completo do [TMDB](https://www.themoviedb.org), com títulos e sinopses em português (quando existem), filtros por género e ano, e atalhos como "Em alta", "Em exibição", "Nos cinemas", "Brevemente" e "Melhores de sempre". Precisa de uma chave grátis do TMDB ([vê como](#-séries-e-filmes-chave-do-tmdb)); sem ela, só aparece o anime.
- **Anime**: pesquisa em **todo** o catálogo do [AniList](https://anilist.co), com filtros por género, ano, temporada e formato. Se o AniList estiver em baixo ou a limitar pedidos, a app passa sozinha para o **MyAnimeList** (através da API [Jikan](https://jikan.moe)).
- Scroll infinito, e detalhes de cada título: sinopse, episódios ou temporadas, duração, estúdio, canal ou realização, elenco, trailer e títulos semelhantes.

**Tierlists**
- **Grupo**: uma tierlist partilhada onde todos arrastam títulos ao mesmo tempo.
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

**Comunidade Lusiaves**
- **Comunidade** (a página inicial): toda a gente está lá, sem entrar em salas.
  - Cada pessoa adiciona títulos, põe-nos na sua tierlist (**A minha**) e dá a sua nota, opinião e recomendação.
  - A tierlist **Comunidade** é a média das tierlists de todos.
  - O **Ranking** mostra os melhores, os mais recomendados e os **Recomendados para ti**.
  - Tem chat e atividade para toda a gente.
  - Como é de todos, ninguém mexe na tierlist dos outros, os tiers não mudam, e só quem adicionou um título o pode tirar.
- **Salas** (página **Salas**): tierlists só com quem convidares, como antes. Uma sala pode aparecer nas **Salas abertas**, com quantas pessoas estão lá nesse momento, para qualquer colega entrar sem link. Ao criar uma sala, a opção "Mostrar nas salas abertas" vem ligada; o dono muda isso quando quiser, em **Convidar**.
- **Empresa ou unidade** (opcional) no perfil, para se saber de onde é cada colega.
- **Só para colaboradores**: com um código da comunidade, quem não o souber não entra, mesmo com a app pública na internet ([vê como](#-só-para-colaboradores-código-da-comunidade)).

**Dono da sala**
- Quem cria a sala é o dono (👑): só o dono muda o nome da sala, e pode passá-la a outro membro no separador **Membros**.
- Se o dono não aparecer durante uma semana (por exemplo, porque perdeu o perfil), qualquer membro pode ficar com a sala.

**Contas (opcionais)**
- Utilizador e palavra-passe para seres **sempre a mesma pessoa** nas salas, mesmo quando o link muda ou usas outro dispositivo.
- **As tuas salas** ficam guardadas na conta: aparecem na página inicial de qualquer dispositivo.
- Crias a conta a partir do perfil que já usas: continuas a ser o mesmo membro, com as mesmas notas e tierlists.

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
| **Render + Neon** | Cria uma base de dados PostgreSQL grátis no [Neon](https://neon.tech) e copia a *connection string*. No [Render](https://render.com) escolhe *New → Blueprint* com este repositório (usa o `render.yaml`, que cria o serviço `lusimovies`, com o link `https://lusimovies.onrender.com` se estiver livre) e cola a string em `DATABASE_URL`. Para séries e filmes, põe também a chave do TMDB em `TMDB_API_KEY`. | Grátis (o Render adormece após 15 min sem uso; o primeiro acesso demora ~1 min) |
| **Docker / VPS** | `docker build -t anime-tierlist .` e `docker run -d -p 3000:3000 -v tierlist-data:/data anime-tierlist` | Depende do servidor |

> Os planos grátis sem disco persistente (como o do Render) apagam os ficheiros quando reiniciam. Nesses casos usa sempre `DATABASE_URL` (PostgreSQL). Como estudante, o [GitHub Student Developer Pack](https://education.github.com/pack) também te dá créditos em vários serviços de alojamento.

---

## 👤 Contas: sempre a mesma pessoa

Sem conta, o teu perfil fica guardado só no browser e **só para aquele endereço**. Quando o link do túnel muda (ou abres a app noutro dispositivo), o browser não te reconhece e entras como uma pessoa nova. Com uma conta isso deixa de acontecer.

1. **Cria a conta a partir do perfil que já tens.** Na página inicial carrega em **Criar conta** (ou abre o teu perfil) e escolhe um utilizador e uma palavra-passe. A conta fica com o teu perfil atual, por isso continuas a ser o mesmo membro nas salas onde já entraste, com as mesmas notas e tierlists. Essas salas passam logo para **As tuas salas**.
2. **Noutro link ou dispositivo, entra na conta.** Na página inicial carrega em **Entrar**; se abrires o link de uma sala, escolhe **Já tenho conta**. Recuperas o teu perfil e a lista das tuas salas.
3. Cada sala em que entras com a conta fica guardada em **As tuas salas**, na página inicial de qualquer dispositivo.

Algumas notas:
- **Primeiro cria a conta, depois entra nos outros sítios.** Se entrares numa conta num dispositivo que já tinha outro perfil sem conta, esse dispositivo passa a usar o perfil da conta.
- Os perfis criados antes, noutros links, continuam nas salas como membros offline: eram pessoas "diferentes" para a app.
- **Esqueceste-te da palavra-passe?** Não há recuperação por email. Quem gere o servidor pode apagar a conta: o ficheiro `data/accounts/<utilizador>.json`, ou `DELETE FROM accounts WHERE username = '<utilizador>';` no PostgreSQL. Depois, num dispositivo onde ainda tenhas a sessão aberta, cria a conta outra vez com o mesmo utilizador e ficas com o mesmo perfil.
- Não há dois utilizadores iguais: se o nome já existir, a conta não é criada (maiúsculas e minúsculas contam como iguais). O nome que aparece nas salas é outra coisa e pode repetir-se.
- As palavras-passe nunca são guardadas: o servidor guarda só um *hash* (scrypt).

---

## 🎬 Séries e filmes (chave do TMDB)

As séries e os filmes vêm do [TMDB](https://www.themoviedb.org) (The Movie Database), que é grátis mas pede uma chave. Sem ela, a app funciona na mesma, só com salas de anime.

1. Cria uma conta em [themoviedb.org](https://www.themoviedb.org/signup) e confirma o email.
2. Abre [Definições → API](https://www.themoviedb.org/settings/api) e pede uma chave de *Developer*. No formulário escolhe um uso pessoal ou educativo; no nome da aplicação põe "Tierlist Live" e no URL o teu link do Render (ou `http://localhost:3000`). A chave aparece logo.
3. Copia a **API Key** (também serve o **API Read Access Token**, o texto comprido).
4. **No teu PC**: no ficheiro `.env`, acrescenta `TMDB_API_KEY=a-tua-chave` e reinicia o servidor. O terminal deve mostrar `Séries e filmes: ativados (TMDB)`.
5. **No Render**: no serviço, abre *Environment → Add Environment Variable*, põe `TMDB_API_KEY` com a chave e guarda. O Render publica outra vez sozinho.

A chave fica só no servidor: os browsers pedem as séries e os filmes ao teu servidor, que fala com o TMDB e guarda as respostas em memória durante uns minutos.

> Este produto usa a API do TMDB mas não é endossado nem certificado pelo TMDB.

---

## 🔒 Só para colaboradores (código da comunidade)

Com a variável `COMMUNITY_CODE`, a app pede esse código uma vez em cada dispositivo. Quem não o souber vê só o ecrã do código: não consegue entrar na Comunidade, criar salas, entrar nelas, ver as salas abertas nem usar a API.

1. Escolhe um código difícil de adivinhar (por exemplo, três palavras juntas).
2. **No Render**: *Environment → Add Environment Variable*, com `COMMUNITY_CODE` e o código, e guarda. **No teu PC**: acrescenta `COMMUNITY_CODE=o-código` ao `.env` e reinicia. O terminal mostra `Acesso: só com o código da comunidade`.
3. Partilha o código pelos canais internos (por exemplo, a intranet ou o email da empresa), não em sítios públicos.

Se o código mudar, toda a gente tem de o voltar a escrever. Para abrir a app a todos, apaga a variável.

---

## 🎨 Marca

- **Nome**: `APP_NAME` e `COMMUNITY` em `src/shared/brand.ts`.
- **Cores**: as variáveis `--color-accent` e `--color-accent-2` em `src/client/index.css`.
- **Logótipo**: `LogoMark` em `src/client/components/Logo.tsx` e o ícone `public/favicon.svg`.

---

## 💾 Onde ficam guardadas as coisas

**Por omissão, tudo fica guardado automaticamente** na pasta `data/` do projeto: `data/rooms/` tem um ficheiro por sala e `data/accounts/` um ficheiro por conta. Isto aguenta reinícios do servidor e do PC. Para fazer uma cópia de segurança, copia a pasta `data/`.

### Usar uma base de dados PostgreSQL (grátis, no Neon)

Faz sentido se quiseres os dados fora do teu PC, ou para mais tarde pores o site online.

1. Cria uma conta em [neon.tech](https://neon.tech) (grátis, sem cartão) e cria um projeto. Escolhe a região *Europe (Frankfurt)*, que fica mais perto.
2. No painel do projeto carrega em **Connect** e copia a *connection string*. É parecida com:
   `postgresql://neondb_owner:…@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Na pasta do projeto, copia o `.env.example` para um ficheiro chamado **`.env`** e cola o link:
   ```
   DATABASE_URL=postgresql://neondb_owner:…@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Reinicia o servidor. O terminal deve mostrar `Dados: PostgreSQL (ep-xxxx…neon.tech)`. As salas e as contas que já tinhas na pasta `data/` são **copiadas automaticamente** para a base de dados na primeira vez.

Para ver os dados, abre o **SQL Editor** do Neon e corre:
```sql
SELECT id, doc->'state'->>'name' AS sala, updated_at FROM rooms;
SELECT username, doc->'profile'->>'name' AS nome, created_at FROM accounts;
```

> O ficheiro `.env` tem a password da base de dados: não o partilhes. Já está no `.gitignore`, por isso não vai para o GitHub. Para voltares a guardar em ficheiros, apaga a linha `DATABASE_URL` do `.env`.

---

## ⚙️ Configuração

Todas as variáveis são opcionais. Podes pô-las num ficheiro **`.env`** na pasta do projeto (vê o `.env.example`), que o servidor lê ao arrancar, ou defini-las como variáveis de ambiente.

| Variável | Por omissão | Para que serve |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface onde o servidor escuta |
| `DATA_DIR` | `./data` | Pasta onde as salas e as contas são guardadas (um ficheiro JSON por sala e por conta) |
| `DATABASE_URL` | — | Se definida, as salas e as contas são guardadas em **PostgreSQL** em vez de ficheiros (Neon, Supabase, Railway…) |
| `TMDB_API_KEY` | — | Chave do TMDB (API Key ou API Read Access Token) para as salas de séries e filmes |
| `COMMUNITY_CODE` | — | Código da comunidade: se definido, só quem o souber usa a app |
| `TRUST_PROXY` | redes privadas | Definição `trust proxy` do Express, para obter o IP real atrás de um proxy |

---

## 🧠 Como funciona

```mermaid
flowchart LR
  subgraph B["Browser de cada colega"]
    UI["React + dnd-kit"] --> RC["RoomClient<br/>(atualizações otimistas)"]
  end
  UI -- "pesquisa de anime" --> AL[("AniList GraphQL")]
  UI -. "se o AniList falhar" .-> JK[("Jikan / MyAnimeList")]
  RC <-- "Socket.IO (WebSocket)" --> S["Servidor Node.js<br/>Express + Socket.IO"]
  UI -- "séries e filmes" --> S
  S -- "com a chave" --> TM[("TMDB")]
  S --> DB[("JSON em ./data<br/>ou PostgreSQL")]
```

- **Operações partilhadas.** Cada alteração é uma *operação* (por exemplo `board.move`: "pôr Frieren no tier S da tierlist do Grupo"). O mesmo código, `src/shared/ops.ts`, aplica as operações no servidor **e** no browser, por isso todos chegam exatamente ao mesmo estado.
- **Otimista.** O browser aplica a tua operação na hora e envia-a ao servidor. O servidor valida-a (com `zod`), aplica-a, dá-lhe um número de sequência e envia-a a toda a gente. Se for recusada (por exemplo, mexer na tierlist pessoal de outra pessoa), o browser desfaz. Se faltar alguma operação, o browser pede o estado completo.
- **Presença.** Cursores, cartas a ser arrastadas, "está a escrever…" e quem está a ver o quê são mensagens efémeras: não ficam guardadas.
- **Persistência.** Cada sala ativa vive em memória no servidor e é gravada cerca de 1 segundo depois de cada alteração: um ficheiro JSON por sala, ou uma linha JSONB em PostgreSQL.
- **Identidade.** O browser gera um id e um segredo aleatórios (guardados em `localStorage`). Cada sala guarda só o *hash* do segredo, para ninguém se fazer passar por ti.
- **Contas.** Uma conta guarda essa identidade (id e segredo), o perfil e a lista de salas, protegidos por uma palavra-passe (guardada como *hash* scrypt). Entrar na conta devolve a identidade ao browser, por isso és o mesmo membro em qualquer link ou dispositivo. Os erros de palavra-passe têm um limite por utilizador para dificultar adivinhas.
- **Catálogos.** As pesquisas de anime vão diretamente do browser ao AniList, por isso cada pessoa tem o seu próprio limite de pedidos. As de séries e filmes passam pelo servidor, que tem a chave do TMDB e guarda as respostas em cache. Quando se adiciona um título à sala, os dados principais (título, capa, géneros…) ficam guardados na sala.
- **Comunidade.** É uma sala especial (`comunidade`), criada quando o servidor arranca pela primeira vez, com regras próprias: não tem dono nem tierlist partilhada, os tiers são fixos e cada pessoa só mexe na sua tierlist e nos títulos que adicionou. Abre em `/`; as salas estão em `/salas` e em `/r/<código>`.
- **Tipos de sala.** Cada sala tem um tipo (tudo, filmes, séries ou anime) e só aceita títulos desse tipo. O dono pode mudar o tipo (`room.kind`) desde que os títulos que já lá estão caibam no novo. O tipo de cada título está na sua chave: `al:` e `mal:` são anime, `tv:` são séries e `mv:` são filmes. As salas antigas, sem tipo, são salas de anime.

### Estrutura do projeto

```
src/
  shared/        código usado pelo servidor e pelo browser
    types.ts     tipos (sala, título, avaliação, presença…)
    media.ts     tipos de sala (anime, séries, filmes, tudo) e de cada título
    catalog.ts   géneros do TMDB e respostas das rotas de séries e filmes
    owner.ts     regras do dono da sala
    brand.ts     nome da app e da comunidade
    ops.ts       reducer das operações (a lógica central)
    schema.ts    validação de tudo o que o servidor recebe
    stats.ts     médias, tierlist "Média", afinidade, recomendações
  server/
    index.ts     arranque do servidor
    app.ts       Express + Socket.IO (+ Vite em desenvolvimento)
    realtime.ts  eventos em tempo real (entrar, operações, presença, cursores)
    rooms.ts     salas em memória, gravação e autenticação
    accounts.ts  contas: palavras-passe (scrypt), perfil e "As tuas salas"
    account-routes.ts  API das contas (criar, entrar, perfil, palavra-passe)
    tmdb.ts      séries e filmes: pedidos ao TMDB, cache e conversão para o formato da app
    catalog-routes.ts  API das séries e filmes para os browsers
    community.ts código da comunidade (acesso só para colaboradores)
    http.ts      API REST (criar sala, info, proxy de imagens para o PNG)
    storage/     gravação em ficheiros JSON ou PostgreSQL
  client/
    lib/         catálogos (anime, séries e filmes), ligação à sala, perfil, exportar PNG…
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

- Os testes E2E simulam a API do AniList e o TMDB (`tests/fake-tmdb.ts`), por isso correm sem internet e sem chave. Na primeira vez instala o browser com `npx playwright install chromium`.
- Para testar também a gravação em PostgreSQL: `TEST_DATABASE_URL=postgres://utilizador:senha@localhost:5432/base npm test`.

---

## 💡 Ideias para continuar

- Salas com palavra-passe e moderação (expulsar membros).
- Recomendar um anime diretamente a um colega, com notificação.
- Modo "votação": um anime de cada vez e cada pessoa vota o tier.
- Tema claro.

---

Dados de anime fornecidos pelo [AniList](https://anilist.co) e pelo [MyAnimeList](https://myanimelist.net) (via [Jikan](https://jikan.moe)). Este projeto não é afiliado a nenhum destes serviços.
