// "Continuar com Google": the server says whether it is on (and for which company domains); the
// button itself is Google's (Google Identity Services), loaded only when one is shown.

export interface GoogleConfig {
  clientId: string;
  /** Only accounts of these Google Workspace domains can sign in (empty: any Google account). */
  domains: string[];
}

interface GisButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface Gis {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    hd?: string;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    context?: 'signin' | 'signup' | 'use';
    itp_support?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GisButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: Gis } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let config: Promise<GoogleConfig | null> | null = null;

/** Google sign-in settings of this server, or null when it is off. */
export function googleConfig(): Promise<GoogleConfig | null> {
  config ??= fetch('/api/auth/providers')
    .then((res) => (res.ok ? (res.json() as Promise<{ google: GoogleConfig | null }>) : { google: null }))
    .then((data) => data.google ?? null)
    .catch(() => {
      // No connection: ask again next time.
      config = null;
      return null;
    });
  return config;
}

let gis: Promise<Gis> | null = null;

/** Google's script, once. It is added after the page has loaded, so a slow Google never holds the app back. */
export function loadGis(): Promise<Gis> {
  gis ??= new Promise<Gis>((resolve, reject) => {
    const add = () => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('gis')));
      script.onerror = () => {
        script.remove();
        reject(new Error('gis'));
      };
      document.head.append(script);
    };
    if (document.readyState === 'complete') add();
    else window.addEventListener('load', add, { once: true });
  }).catch((err: unknown) => {
    // Blocked or offline: try again when a button is shown next time.
    gis = null;
    throw err;
  });
  return gis;
}

/** After signing out, Google must not pick the same account again by itself. */
export function forgetGoogleChoice() {
  window.google?.accounts?.id?.disableAutoSelect();
}

/** "@lusiaves.pt" (or "@a.pt ou @b.pt") for the texts. */
export function domainsText(domains: string[]) {
  return domains.map((d) => `@${d}`).join(' ou ');
}
