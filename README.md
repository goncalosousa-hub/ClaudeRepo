# LusiHub

Uma **webapp** para os colaboradores do **Grupo Lusiaves** partilharem o que andam a ver, a ler e a descobrir: **filmes, séries, anime, livros, restaurantes e sítios**. O site abre na **Comunidade**, um espaço de toda a gente, sem salas, com uma secção por categoria. Cada secção é uma lista de **recomendações**: carregas em "Recomendar", escolhes o filme, livro, restaurante ou sítio e dás as tuas **estrelas** (de 1 a 5), a tua **opinião** e **fotos**; todos veem as dos outros, ao vivo. Não há nada para arrastar. Para grupos mais pequenos (uma equipa, um turno), há as **Salas**, que também podem ter uma tierlist.

Na instalação da Lusiaves **entra-se com a conta Google do email do trabalho** (`GOOGLE_ONLY`): uma conta é sempre a mesma pessoa, em qualquer link ou dispositivo, com a lista das suas salas. Noutras instalações a app também pode funcionar sem conta (crias uma sala, partilhas o link e pronto) ou com utilizador e palavra-passe.

---

## ✨ Funcionalidades

**Filmes, séries, anime, livros, restaurantes e sítios**
- Ao criar uma sala escolhes o que vão recomendar: **Filmes e séries** (filmes, séries e anime juntos, a opção por omissão), **Filmes**, **Séries**, **Anime**, **Livros**, **Restaurantes** ou **Sítios**. O dono da sala pode mudar o tipo depois, no cabeçalho da sala ou em "Procurar".
- **Filmes e séries**: catálogo completo do [TMDB](https://www.themoviedb.org), com títulos e sinopses em português (quando existem), filtros por género e ano, e atalhos como "Em alta", "Em exibição", "Nos cinemas", "Brevemente" e "Melhores de sempre". Precisa de uma chave grátis do TMDB ([vê como](#-séries-e-filmes-chave-do-tmdb)); sem ela, só aparece o anime.
- **Anime**: pesquisa em **todo** o catálogo do [AniList](https://anilist.co), com filtros por género, ano, temporada e formato. Se o AniList estiver em baixo ou a limitar pedidos, a app passa sozinha para o **MyAnimeList** (através da API [Jikan](https://jikan.moe)).
- **Livros**: pesquisa na [Open Library](https://openlibrary.org) (grátis, sem chave), com atalhos "Em alta", "Em português", "Mais lidos" e "Mais bem avaliados" e filtro por género. Mostra autor, ano, páginas e sinopse (quando existe).
- **Restaurantes e sítios** (praias, miradouros, museus, castelos, trilhos…): pesquisa no mapa do [OpenStreetMap](https://www.openstreetmap.org) (através do [Photon](https://photon.komoot.io), grátis, sem chave). O que não estiver no mapa **adiciona-se à mão** (nome, tipo, localidade e morada). Cada um tem um botão **Ver no mapa** (Google Maps).
- **Fotos**: em qualquer título podes juntar fotos (até 6 por pessoa); nos restaurantes e sítios a primeira foto passa a ser a capa. As fotos são reduzidas no browser (1280 px) e perdem os dados EXIF, incluindo a localização GPS. Quem pôs uma foto pode apagá-la; numa sala, o dono também; na comunidade, as contas em `ADMINS`.
- Scroll infinito, e detalhes de cada título: sinopse, episódios ou temporadas, duração, estúdio, canal ou realização, elenco, trailer e títulos semelhantes.

**Recomendações** (o separador principal, na Comunidade e nas Salas)
- Cada título é um cartão grande com a foto ou capa, a média das **estrelas**, quantos o recomendam e a última opinião.
- O botão **Recomendar** leva a um passo só: pesquisar, **Escolher**, e a janela para dar as estrelas e a opinião abre logo, a dizer que o título já foi adicionado. No fim carrega-se em **Publicar** (ou **Guardar**, ao mudar uma opinião): a opinião fica guardada e aparece a confirmação. Também se guarda sozinha enquanto se escreve.
- Mudar de secção (filmes e séries, livros, restaurantes, sítios) é instantâneo: a app já tem as outras secções carregadas e atualiza-as em segundo plano.
- Ordenar por **Recentes**, **Mais estrelas** ou **Mais comentados**; filtrar por filmes, séries ou anime; procurar na lista.
- "Os colegas recomendam-te": o que os colegas recomendam e tu ainda não viste (quando a lista já é grande).

**Tierlists (só nas Salas, opcional)**
- Pensadas para grupos que gostam do formato: na Comunidade não há tierlist, para ninguém ter de arrastar nada.
- **Grupo**: uma tierlist partilhada onde todos arrastam títulos ao mesmo tempo.
- **A minha**: cada pessoa tem a sua tierlist pessoal, que todos podem ver em direto.
- **Média**: gerada automaticamente a partir das tierlists pessoais de todos (o consenso da turma).
- Arrastar e largar com o rato ou com o dedo (toque longo no telemóvel). Também podes mover pelo detalhe do anime.
- Tiers personalizáveis (nomes, cores, ordem e modelos como "🐐 GOAT / 🔥 Top / 💀 Lixo").
- Exportar qualquer tierlist como **imagem PNG** para partilhar.

**Opiniões**
- **Estrelas de 1 a 5**, **recomendação** (👍 Recomendo / 🤔 Talvez / 👎 Não recomendo), **estado** (Já vi / A ver / Quero ver / Desisti; nos livros Já li / A ler / Quero ler; nos restaurantes e sítios Já fui / Quero ir) e **opinião escrita**, gravada automaticamente.
- As notas guardam-se de 1 a 10 (uma estrela vale 2): as notas dadas antes das estrelas continuam a contar (7/10 são 3,5 estrelas).
- **Pessoas**: estatísticas de cada um, géneros favoritos e **afinidade de gostos** contigo.

**Tempo real**
- Quem está online e o que está a fazer ("A mover Frieren", "A escrever sobre One Piece"…).
- Os **cursores** dos colegas na tierlist.
- Quando alguém arrasta uma carta, vês a carta marcada com o nome da pessoa e o sítio onde a vai largar.
- Aviso "está a escrever…" nas opiniões e no chat.
- **Chat** da sala e **feed de atividade**.
- As alterações aparecem logo no teu ecrã e sincronizam com os outros em milissegundos. Se perderes a ligação, o que fizeres é enviado quando voltar.

**Comunidade Lusiaves**
- **Comunidade** (a página inicial): toda a gente está lá, sem entrar em salas. Tem quatro secções, cada uma com as suas recomendações e chat: **🍿 Filmes e séries** (`/`), **📚 Livros** (`/livros`), **🍽️ Restaurantes** (`/restaurantes`) e **📍 Sítios** (`/sitios`).
  - Cada pessoa recomenda títulos e dá as suas estrelas, opinião, recomendação e fotos.
  - Os separadores são só três: **Recomendações**, **Procurar** e **Pessoas** (mais o chat).
  - Tem chat e atividade para toda a gente.
  - Como é de todos, só quem adicionou um título (ou uma foto) o pode tirar. As contas em `ADMINS` podem tirar qualquer título ou foto (moderação).
- **Salas** (página **Salas**): espaços só com quem convidares, com as mesmas recomendações e, se quiserem, uma **Tierlist**. Uma sala pode aparecer nas **Salas abertas**, com quantas pessoas estão lá nesse momento, para qualquer colega entrar sem link. Ao criar uma sala, a opção "Mostrar nas salas abertas" vem ligada; o dono muda isso quando quiser, em **Convidar**.
- **Empresa ou unidade** (opcional) no perfil, para se saber de onde é cada colega.
- **Só para colaboradores**: com um código da comunidade, quem não o souber não entra, mesmo com a app pública na internet ([vê como](#-só-para-colaboradores-código-da-comunidade)).

**Dono da sala**
- Quem cria a sala é o dono (👑): só o dono muda o nome da sala, e pode passá-la a outro membro no separador **Pessoas**.
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
   New-NetFirewallRule -DisplayName "LusiHub" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```
   Em casa, também podes pôr a rede Wi-Fi como **Privada**: *Definições → Rede e Internet → Wi-Fi → (a tua rede) → Tipo de perfil de rede*.
4. **Rede da escola ou universidade** (por exemplo, eduroam). Estas redes costumam bloquear ligações entre computadores. Usa o túnel da opção 2.

### 3. Alojar online (sempre disponível)

| Onde | Como | Custo |
|---|---|---|
| **Railway** | *New Project → Deploy from GitHub repo*. Adiciona um **Volume** montado em `/data` e a variável `DATA_DIR=/data`. | Período de teste; depois ~5 USD/mês |
| **Render + Neon** | Cria uma base de dados PostgreSQL grátis no [Neon](https://neon.tech) e copia a *connection string*. No [Render](https://render.com) escolhe *New → Blueprint* com este repositório (usa o `render.yaml`, que cria o serviço `lusihub`, com o link `https://lusihub.onrender.com` se estiver livre) e cola a string em `DATABASE_URL`. Para séries e filmes, põe também a chave do TMDB em `TMDB_API_KEY`. | Grátis (o Render adormece após 15 min sem uso; o primeiro acesso demora ~1 min) |
| **Docker / VPS** | `docker build -t lusihub .` e `docker run -d -p 3000:3000 -v lusihub-data:/data lusihub` | Depende do servidor |

> Os planos grátis sem disco persistente (como o do Render) apagam os ficheiros quando reiniciam. Nesses casos usa sempre `DATABASE_URL` (PostgreSQL). Como estudante, o [GitHub Student Developer Pack](https://education.github.com/pack) também te dá créditos em vários serviços de alojamento.

---

## 👤 Contas: sempre a mesma pessoa

Sem conta, o teu perfil fica guardado só no browser e **só para aquele endereço**. Quando o link do túnel muda (ou abres a app noutro dispositivo), o browser não te reconhece e entras como uma pessoa nova. Com uma conta isso deixa de acontecer.

1. **Cria a conta a partir do perfil que já tens.** Na página inicial carrega em **Criar conta** (ou abre o teu perfil) e escolhe um utilizador e uma palavra-passe. A conta fica com o teu perfil atual, por isso continuas a ser o mesmo membro nas salas onde já entraste, com as mesmas notas e tierlists. Essas salas passam logo para **As tuas salas**.
2. **Noutro link ou dispositivo, entra na conta.** Na página inicial carrega em **Entrar**; se abrires o link de uma sala, escolhe **Já tenho conta**. Recuperas o teu perfil e a lista das tuas salas.
3. Cada sala em que entras com a conta fica guardada em **As tuas salas**, na página inicial de qualquer dispositivo.

Com o login da Google ligado, o mais simples é **Continuar com Google**: a conta é criada sozinha na primeira vez, sem utilizador nem palavra-passe para decorar ([vê abaixo](#-entrar-com-a-google-contas-da-lusiaves)).

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
2. Abre [Definições → API](https://www.themoviedb.org/settings/api) e pede uma chave de *Developer*. No formulário escolhe um uso pessoal ou educativo; no nome da aplicação põe "LusiHub" e no URL o teu link do Render (ou `http://localhost:3000`). A chave aparece logo.
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

Se o código mudar, toda a gente tem de o voltar a escrever. Para abrir a app a todos, apaga a variável. Com o [login da Google](#-entrar-com-a-google-contas-da-lusiaves) e `GOOGLE_DOMAIN`, os colegas também podem entrar com a conta Google do trabalho, sem o código.

---

## 🔑 Entrar com a Google (contas da Lusiaves)

> **Só com a Google (`GOOGLE_ONLY=true`, ligado no `render.yaml`).** A app só se usa com uma conta Google: quem abre o site vê apenas «Continuar com Google». Não há perfis sem conta, nem utilizador e palavra-passe, nem código da comunidade (`COMMUNITY_CODE` deixa de abrir a app). O servidor garante-o, não é só a interface: sem entrar com a Google não se lê nada da API, e nas salas só entra a identidade de uma conta Google. Quem já usava a app neste browser fica com o que tinha: um perfil sem conta passa a ser o da conta nova, e uma conta com palavra-passe passa a entrar com a Google (fica a mesma conta). O cookie de acesso é feito com um segredo que o servidor cria uma vez e guarda (na base de dados ou em `data/`), por isso reiniciar não obriga ninguém a entrar outra vez. Para voltar ao modo aberto, apaga a variável.

Com `GOOGLE_CLIENT_ID` aparece o botão **Continuar com Google**: os colegas entram com a conta Google do email do trabalho, sem inventar um utilizador nem decorar mais uma palavra-passe, e são sempre a mesma pessoa em qualquer dispositivo.

Com `GOOGLE_DOMAIN=grupolusiaves.pt,lusiaves.pt` só entram as contas do Google Workspace do grupo (é lá que estão os emails `@grupolusiaves.pt` e `@lusiaves.pt`). O servidor confirma a assinatura da Google e o domínio que a própria Google indica no token (`hd`, o domínio da organização no Workspace); um Gmail pessoal, ou uma conta Google criada com um email da empresa mas fora do Workspace, é recusado. Quem sai da empresa e perde a conta do Workspace deixa de conseguir entrar com a Google. Se outras empresas do grupo tiverem domínios próprios, junta-os com vírgulas.

- **Na primeira vez a conta é criada sozinha.** O utilizador vem do email (`ana.sofia@lusiaves.pt` → `@ana.sofia`; se já existir, `@ana.sofia2`) e o nome vem da Google (muda-se no perfil). Se o browser já tinha um perfil sem conta, a conta fica com ele: o mesmo membro, nas mesmas salas.
- **Quem já tem conta com palavra-passe** pode ligá-la à Google em *O teu perfil → Ligar à conta Google*. Depois entra com qualquer das duas.
- **Com o código da comunidade** (`COMMUNITY_CODE`), o ecrã do código também mostra o botão: uma conta Google da Lusiaves abre a app sem o código. Isto só acontece com `GOOGLE_DOMAIN` definido; sem ele, qualquer conta Google podia entrar, por isso aí só o código abre a app.
- `ADMINS` também aceita o email da conta Google (ex.: `ADMINS=ana.sofia@lusiaves.pt`).

**Configurar na Google (uma vez):**

1. Em [console.cloud.google.com](https://console.cloud.google.com) cria um projeto (ex.: *LusiHub*).
2. Abre **Google Auth Platform → Branding**: nome da app *LusiHub*, email de suporte e email de contacto. Em **App domain**: *Application home page* `https://lusihub.onrender.com` e *Application privacy policy link* `https://lusihub.onrender.com/privacidade` (a política de privacidade da app, aberta a todos, mesmo sem o código da comunidade). Em **Authorized domains** junta `lusihub.onrender.com` (o `onrender.com` é um sufixo público, por isso cada app do Render conta como um domínio próprio). Os termos de utilização são opcionais. Não carregues um logótipo: com logótipo a Google pede verificação.
3. **Audience**: *External* (com uma conta pessoal não há a opção *Internal*). Depois carrega em **Publish app**: enquanto estiver em *Testing*, só entram as contas da lista de *test users*. Como a app só pede o nome e o email, não é preciso a verificação da Google.
4. **Clients → Create client → Web application**. Em **Authorized JavaScript origins** põe o endereço da app, `https://lusihub.onrender.com` (e, para experimentar no teu PC, `http://localhost:3000` e `http://localhost`). Os *Authorized redirect URIs* não são precisos. Se um dia a app tiver outro endereço (ex.: `lusihub.lusiaves.pt`), acrescenta-o aqui.
5. Copia o **Client ID** (acaba em `.apps.googleusercontent.com`). Não é secreto: aparece na própria página. O *Client secret* não é preciso; não o partilhes.
6. **No Render**, `GOOGLE_CLIENT_ID` e `GOOGLE_DOMAIN` já vêm no `render.yaml`. **No teu PC**, acrescenta-os ao `.env` e reinicia: o terminal mostra `Google: "Continuar com Google" ativado (só contas @grupolusiaves.pt, @lusiaves.pt)`.

---

## 🛡️ Administração

As contas em `ADMINS` (nome de utilizador ou email da conta Google, separados por vírgulas, ex.: `ADMINS=goncalo.sousa@grupolusiaves.pt`) veem o botão **Administração** no seu perfil, que abre a página **`/admin`**:

- **Resumo**: pessoas na comunidade (e quantas estão online), contas, recomendações, opiniões, fotos (e o espaço que ocupam), mensagens e salas, secção a secção; e como o servidor está configurado (Google, código da comunidade, TMDB, administradores).
- **Pessoas**: toda a gente da comunidade e todas as contas, com pesquisa (nome, empresa, utilizador ou email), filtros (com conta, sem conta, **nomes repetidos**, úteis para encontrar perfis de teste), as secções onde cada pessoa entrou, o que fez e quando foi vista. **Eliminar** (uma ou várias de uma vez) tira a pessoa de todas as secções e salas, com as opiniões, fotos e mensagens; os títulos que adicionou saem também, menos os que tiverem opiniões, fotos ou tiers de colegas; e a conta é apagada. Quem estiver a ver a comunidade vê-a desaparecer logo. Se essa pessoa voltar a abrir a app, entra como alguém novo. Não dá para te eliminares a ti nem a outros administradores (tira-os primeiro de `ADMINS`).
- **Salas**: todas as salas (as secções da comunidade não), com membros, títulos e atividade; **Eliminar** apaga a sala e as fotos dela, e quem lá estava passa a ver «Sala não encontrada».

Os administradores também podem tirar qualquer título ou foto diretamente na comunidade.

---

## 🔏 Privacidade

A política de privacidade está em **`/privacidade`** (`src/client/components/PrivacyPage.tsx`), aberta a todos, mesmo quando a app pede o código da comunidade: é o link que a Google pede para publicar o login com a Google, e aparece também no ecrã do código, junto ao botão da Google e no rodapé das Salas. Diz que dados a app guarda (perfil, conta, email e identificador da conta Google, o que cada um partilha, fotos sem EXIF), com quem (alojamento, Google, catálogos públicos) e como pedir para os ver ou apagar. O contacto é `CONTACT_EMAIL`, em `src/shared/brand.ts`. Se a app passar a guardar outras coisas, atualiza o texto e a data.

---

## 🎨 Marca

- **Nome**: `APP_NAME` e `COMMUNITY` em `src/shared/brand.ts`. Lá está também `CONTACT_EMAIL`, o contacto da [política de privacidade](#-privacidade).
- **Cores**: tema claro e quente com o vermelho da Lusiaves. O vermelho do logótipo (`#c31315`) fica para a marca; nos botões e destaques usa-se uma versão um pouco mais escura e suave (`--color-accent`, `#b52a2f`) com um coral (`--color-accent-2`) nos degradês. Os fundos são brancos quentes e o texto grafite. Está tudo nas variáveis de `src/client/index.css`.
- **Logótipo**: o da Lusiaves, em `public/logo.png` (usado por `LogoMark` em `src/client/components/Logo.tsx`), `public/favicon.png` e `public/apple-touch-icon.png`.

---

## 💾 Onde ficam guardadas as coisas

**Por omissão, tudo fica guardado automaticamente** na pasta `data/` do projeto: `data/rooms/` tem um ficheiro por sala, `data/accounts/` um ficheiro por conta e `data/photos/` as fotos. Isto aguenta reinícios do servidor e do PC. Para fazer uma cópia de segurança, copia a pasta `data/`.

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
SELECT pg_size_pretty(SUM(bytes)) AS espaco_das_fotos, count(*) AS fotos FROM photos;
```

> **Fotos na base de dados.** Com `DATABASE_URL`, as fotos ficam na tabela `photos`. O Neon gratuito tem 512 MB para tudo; por isso as fotos têm um limite total (`PHOTOS_MAX_MB`, 300 MB por omissão, o que dá para uns milhares de fotos). Quando o limite é atingido, a app avisa que o espaço está cheio. As fotos que estavam em `data/photos/` não são copiadas para a base de dados.

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
| `PHOTOS_MAX_MB` | `300` | Espaço máximo para todas as fotos, em MB |
| `ADMINS` | — | Contas (nomes de utilizador ou emails das contas Google, separados por vírgulas) com acesso à página de administração (`/admin`) e que podem apagar qualquer título ou foto na comunidade |
| `GOOGLE_CLIENT_ID` | — | Client ID da Google (Google Cloud): ativa o botão **Continuar com Google** |
| `GOOGLE_DOMAIN` | — | Só as contas Google destes domínios do Google Workspace entram com a Google (ex.: `grupolusiaves.pt,lusiaves.pt`). Com `COMMUNITY_CODE`, também abrem a app sem o código |
| `GOOGLE_ONLY` | — | `true`: só se entra com a conta Google (sem perfis sem conta, sem palavras-passe, sem código). Precisa de `GOOGLE_CLIENT_ID` |
| `OPENLIBRARY_URL`, `PHOTON_URL`, `GOOGLE_CERTS_URL` | serviços públicos | Outro servidor para os livros, o mapa ou as chaves da Google (usado nos testes) |
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
  UI -- "séries, filmes, livros, mapa, fotos" --> S
  S -- "com a chave" --> TM[("TMDB")]
  S --> OL[("Open Library")]
  S --> PH[("Photon / OpenStreetMap")]
  S --> DB[("JSON em ./data<br/>ou PostgreSQL")]
```

- **Operações partilhadas.** Cada alteração é uma *operação* (por exemplo `board.move`: "pôr Frieren no tier S da tierlist do Grupo"). O mesmo código, `src/shared/ops.ts`, aplica as operações no servidor **e** no browser, por isso todos chegam exatamente ao mesmo estado.
- **Otimista.** O browser aplica a tua operação na hora e envia-a ao servidor. O servidor valida-a (com `zod`), aplica-a, dá-lhe um número de sequência e envia-a a toda a gente. Se for recusada (por exemplo, mexer na tierlist pessoal de outra pessoa), o browser desfaz. Se faltar alguma operação, o browser pede o estado completo.
- **Presença.** Cursores, cartas a ser arrastadas, "está a escrever…" e quem está a ver o quê são mensagens efémeras: não ficam guardadas.
- **Persistência.** Cada sala ativa vive em memória no servidor e é gravada cerca de 1 segundo depois de cada alteração: um ficheiro JSON por sala, ou uma linha JSONB em PostgreSQL.
- **Identidade.** O browser gera um id e um segredo aleatórios (guardados em `localStorage`). Cada sala guarda só o *hash* do segredo, para ninguém se fazer passar por ti.
- **Contas.** Uma conta guarda essa identidade (id e segredo), o perfil e a lista de salas, protegidos por uma palavra-passe (guardada como *hash* scrypt). Entrar na conta devolve a identidade ao browser, por isso és o mesmo membro em qualquer link ou dispositivo. Os erros de palavra-passe têm um limite por utilizador para dificultar adivinhas.
- **Catálogos.** As pesquisas de anime vão diretamente do browser ao AniList, por isso cada pessoa tem o seu próprio limite de pedidos. As de séries e filmes (TMDB), livros (Open Library) e restaurantes e sítios (Photon/OpenStreetMap) passam pelo servidor, que guarda as respostas em cache (e tem a chave do TMDB). Quando se adiciona um título à sala, os dados principais (título, capa, géneros…) ficam guardados na sala.
- **Comunidade.** São quatro salas especiais (`comunidade`, `livros`, `restaurantes`, `sitios`), criadas quando o servidor arranca, com regras próprias: não têm dono nem tierlist (a interface só mostra as recomendações) e cada pessoa só mexe nas suas opiniões e nos títulos e fotos que adicionou. Abrem em `/`, `/livros`, `/restaurantes` e `/sitios`; as salas estão em `/salas` e em `/r/<código>`.
- **Mudar de secção sem esperar.** O browser guarda em memória o último estado de cada sala onde esteve e, depois de entrar numa secção da comunidade, vai buscar as outras em segundo plano (`GET /api/rooms/<secção>/state`, só para as secções da comunidade, que são de toda a gente). Ao mudar de secção, a página aparece logo com esse estado, enquanto a ligação em tempo real entra na sala e o substitui pelo atual (uma linha fina no cabeçalho mostra que está a atualizar). As salas privadas só se leem entrando nelas.
- **Fotos.** O browser reduz cada foto (1280 px e uma versão de 360 px para as listas, em JPEG) e envia-a para `POST /api/rooms/<sala>/photos` com a identidade do membro. O servidor confirma que é membro da sala e que é mesmo um JPEG, guarda-a (ficheiro ou PostgreSQL) e acrescenta-a à sala com a operação `photo.add`, que chega logo a toda a gente. Apagar uma foto, ou o título dela, apaga também a imagem.
- **Tipos de sala.** Cada sala tem um tipo (filmes e séries, filmes, séries, anime, livros, restaurantes ou sítios) e só aceita títulos desse tipo. O dono pode mudar o tipo (`room.kind`) desde que os títulos que já lá estão caibam no novo. O tipo de cada título está na sua chave: `al:` e `mal:` são anime, `tv:` são séries, `mv:` são filmes, `bk:` são livros, `rs:` restaurantes e `pl:` sítios (com o id do OpenStreetMap, ou `x…` quando foram adicionados à mão). As salas antigas, sem tipo, são salas de anime.

### Estrutura do projeto

```
src/
  shared/        código usado pelo servidor e pelo browser
    types.ts     tipos (sala, título, avaliação, presença…)
    media.ts     tipos de sala (filmes e séries, anime, livros, restaurantes, sítios…) e de cada título
    catalog.ts   géneros do TMDB e dos livros, tipos de sítios e respostas das rotas dos catálogos
    owner.ts     regras do dono da sala
    brand.ts     nome da app e da comunidade, contacto da política de privacidade
    ops.ts       reducer das operações (a lógica central)
    schema.ts    validação de tudo o que o servidor recebe
    stats.ts     médias, tierlist "Média", afinidade, recomendações
  server/
    index.ts     arranque do servidor
    app.ts       Express + Socket.IO (+ Vite em desenvolvimento)
    realtime.ts  eventos em tempo real (entrar, operações, presença, cursores)
    rooms.ts     salas em memória, gravação e autenticação
    accounts.ts  contas: palavras-passe (scrypt), contas Google, perfil e "As tuas salas"
    account-routes.ts  API das contas (criar, entrar, entrar com a Google, perfil, palavra-passe)
    admin-routes.ts    API da página de administração (resumo, pessoas, salas; só para ADMINS)
    google.ts    entrar com a Google: verifica o token (assinatura, app, validade, domínio)
    tmdb.ts      séries e filmes: pedidos ao TMDB, cache e conversão para o formato da app
    books.ts     livros: pesquisa na Open Library
    places.ts    restaurantes e sítios: pesquisa no OpenStreetMap (Photon)
    catalog-routes.ts  API dos catálogos (séries, filmes, livros, mapa) para os browsers
    photo-routes.ts    envio e leitura das fotos
    community.ts código da comunidade (acesso só para colaboradores)
    http.ts      API REST (criar sala, info, proxy de imagens para o PNG)
    storage/     gravação em ficheiros JSON ou PostgreSQL
  client/
    lib/         catálogos, fotos (reduzir e enviar), ligação à sala, perfil, exportar PNG…
    components/  interface (recomendações, tierlist das salas, procurar, pessoas, chat…)
tests/           testes unitários, de integração e E2E (Playwright)
```

---

## 🧪 Testes

```bash
npm test               # testes unitários e de integração (Vitest), incluindo o servidor em tempo real
npm run typecheck      # verificação de tipos (TypeScript)
npm run build && npm run test:e2e   # dois browsers a usar a mesma sala (Playwright)
```

- Os testes E2E simulam a API do AniList, o TMDB, a Open Library, o Photon e o login da Google (`tests/fake-tmdb.ts`, `tests/fake-catalogs.ts` e `tests/fake-google.ts`, com chaves próprias e um botão da Google falso), por isso correm sem internet e sem chave. Na primeira vez instala o browser com `npx playwright install chromium`.
- Para testar também a gravação em PostgreSQL: `TEST_DATABASE_URL=postgres://utilizador:senha@localhost:5432/base npm test`.

---

## 💡 Ideias para continuar

- Salas com palavra-passe e moderação (expulsar membros).
- Recomendar um anime diretamente a um colega, com notificação.
- Modo "votação": um anime de cada vez e cada pessoa vota o tier.
- Tema claro.

---

Dados de anime fornecidos pelo [AniList](https://anilist.co) e pelo [MyAnimeList](https://myanimelist.net) (via [Jikan](https://jikan.moe)), de séries e filmes pelo [TMDB](https://www.themoviedb.org), de livros pela [Open Library](https://openlibrary.org) e de restaurantes e sítios pelo [OpenStreetMap](https://www.openstreetmap.org/copyright) (© contribuidores do OpenStreetMap, pesquisa com [Photon](https://photon.komoot.io)). Este projeto não é afiliado a nenhum destes serviços.
