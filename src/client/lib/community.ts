// The community code (colleagues only), when the server asks for one.

export async function communityLocked(): Promise<boolean> {
  try {
    const res = await fetch('/api/community/status');
    if (!res.ok) return false;
    const status = (await res.json()) as { required: boolean; unlocked: boolean };
    return status.required && !status.unlocked;
  } catch {
    // Server unreachable: the rest of the app shows that already.
    return false;
  }
}

/** Sends the code; the server answers with a cookie that opens the app in this browser. */
export async function unlockCommunity(code: string): Promise<'ok' | 'wrong' | 'rate_limited' | 'network'> {
  try {
    const res = await fetch('/api/community/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return 'ok';
    return res.status === 429 ? 'rate_limited' : 'wrong';
  } catch {
    return 'network';
  }
}
