import { useEffect, type ReactNode } from 'react';
import { APP_NAME, COMMUNITY, CONTACT_EMAIL } from '../../shared/brand';
import { Logo } from './Logo';

/** When the text below last changed. */
const UPDATED = '29 de setembro de 2026';

export const PRIVACY_PATH = '/privacidade';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

const Mail = () => (
  <a className="font-medium text-accent underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
    {CONTACT_EMAIL}
  </a>
);

const External = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="underline underline-offset-2 hover:text-fg" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

/**
 * The privacy policy (/privacidade). Open to anyone, also without the community code: it is the page
 * linked from Google's sign-in screen.
 */
export function PrivacyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = `Política de privacidade · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6">
        <article className="space-y-8 rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted sm:p-8 sm:text-base [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-fg">Política de privacidade</h1>
            <p className="text-xs text-faint">Última atualização: {UPDATED}</p>
            <p>
              O {APP_NAME} é um espaço para os colaboradores do {COMMUNITY} recomendarem filmes, séries, anime, livros,
              restaurantes e sítios. Esta página explica que dados a app guarda, para quê, e o que podes fazer com eles.
            </p>
            <p>
              <strong>Em resumo:</strong> guardamos só o necessário para a app funcionar. Não há publicidade nem
              rastreio, e não vendemos nem cedemos os teus dados a ninguém.
            </p>
          </div>

          <Section title="Quem é o responsável">
            <p>
              Para qualquer pergunta ou pedido sobre os teus dados, escreve a quem gere o {APP_NAME}: <Mail />.
            </p>
          </Section>

          <Section title="Que dados guardamos">
            <ul>
              <li>
                <strong>Perfil:</strong> o nome que escolhes, a cor, o avatar e, se quiseres, a empresa ou unidade onde
                trabalhas. Os colegas veem-nos nas salas e na Comunidade.
              </li>
              <li>
                <strong>Conta</strong> (opcional): o nome de utilizador e a lista das salas onde entraste («As tuas
                salas»). A palavra-passe nunca é guardada: fica só uma impressão digital cifrada dela (scrypt), que não
                permite recuperá-la.
              </li>
              <li>
                <strong>Entrar com a Google:</strong> ao usares «Continuar com Google», a Google envia à app o teu nome,
                o teu email e um identificador da tua conta Google. A app guarda o email e o identificador, para te
                reconhecer da próxima vez, e usa o nome só para preencher o teu perfil (podes mudá-lo). A app não tem
                acesso à tua palavra-passe da Google, ao teu email (Gmail), aos teus ficheiros, contactos, calendário ou a
                qualquer outro serviço da Google.
              </li>
              <li>
                <strong>O que partilhas:</strong> recomendações, estrelas, opiniões, o que já viste ou queres ver,
                mensagens do chat, tierlists das salas e fotos. Quem está na mesma sala vê-os; na Comunidade, todos os
                colaboradores. As fotos são reduzidas no teu browser antes de serem enviadas e perdem os dados EXIF,
                incluindo a localização GPS.
              </li>
              <li>
                <strong>Presença:</strong> enquanto tens a app aberta, os colegas na mesma sala veem que estás online e o
                que estás a ver. Depois de saíres fica só a hora da tua última visita a cada sala.
              </li>
              <li>
                <strong>No teu browser:</strong> o teu perfil (com um código secreto que prova à app que és tu), as últimas
                salas que abriste e as tuas preferências ficam no armazenamento local do browser. Quando a app pede o
                código da comunidade fica também um cookie (<code>atl_access</code>), para não o pedir outra vez. Não há
                cookies de publicidade nem de estatísticas.
              </li>
              <li>
                <strong>Dados técnicos:</strong> para evitar abusos, o servidor conta os pedidos de cada endereço IP
                durante alguns minutos, só em memória. O serviço de alojamento pode guardar registos técnicos dos acessos
                (por exemplo, o endereço IP) durante algum tempo.
              </li>
            </ul>
          </Section>

          <Section title="Para que os usamos">
            <p>
              Só para a app funcionar: mostrar o teu perfil e o que partilhas aos colegas, reconhecer-te quando voltas e
              proteger a app de abusos. Não usamos os dados para publicidade nem para criar perfis de ninguém. A base é o
              teu consentimento, quando crias o perfil e escolhes o que partilhas, e o interesse legítimo em manter a app
              segura.
            </p>
          </Section>

          <Section title="Onde ficam e quem mais os recebe">
            <ul>
              <li>
                Os dados ficam no servidor da app, alojado no <External href="https://render.com/privacy">Render</External>
                , e na base de dados, no <External href="https://neon.com/privacy-policy">Neon</External>.
              </li>
              <li>
                O início de sessão com a Google é tratado pela Google, segundo a{' '}
                <External href="https://policies.google.com/privacy">política de privacidade da Google</External>.
              </li>
              <li>
                Para procurar títulos, a app usa catálogos públicos: TMDB, AniList, MyAnimeList (através do Jikan), Open
                Library e OpenStreetMap (através do Photon). As pesquisas de anime vão do teu browser diretamente para o
                AniList ou o MyAnimeList; as outras passam pelo servidor da app. As capas e imagens vêm desses serviços,
                que por isso recebem o endereço IP do teu browser. Nenhum deles recebe o teu perfil nem a tua conta.
              </li>
              <li>O botão «Ver no mapa» abre o Google Maps, só quando carregas nele.</li>
            </ul>
          </Section>

          <Section title="Durante quanto tempo">
            <p>
              Enquanto a app existir, ou até pedires que sejam apagados. Podes apagar a qualquer momento as tuas opiniões,
              as tuas fotos e os títulos que adicionaste. Terminar a sessão apaga o que ficou guardado no browser desse
              dispositivo.
            </p>
          </Section>

          <Section title="Os teus direitos">
            <p>
              Podes pedir para ver, corrigir ou apagar os teus dados (incluindo a conta), para os receber noutro formato ou
              para deixarmos de os tratar, escrevendo para <Mail />. Também podes apresentar uma reclamação à Comissão
              Nacional de Proteção de Dados (<External href="https://www.cnpd.pt">CNPD</External>).
            </p>
          </Section>

          <Section title="Alterações">
            <p>Se esta política mudar, esta página é atualizada e a data no topo muda.</p>
          </Section>
        </article>
      </main>
    </div>
  );
}
