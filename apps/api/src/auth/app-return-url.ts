/**
 * Whether the API may send the browser (and with it a sign-in code) to this app address: it must
 * have the scheme and host of one configured prefix, and a path under that prefix's path.
 */
export function isAllowedReturnUrl(candidate: string, prefixes: string[]) {
  const url = parse(candidate);
  if (!url || url.username || url.password || url.hash) return false;
  return prefixes.some((prefix) => {
    const allowed = parse(prefix);
    return (
      allowed !== null &&
      url.protocol === allowed.protocol &&
      url.host === allowed.host &&
      isUnder(url.pathname, allowed.pathname)
    );
  });
}

/** The app address with the outcome of the sign-in in its query. */
export function withParams(
  returnUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(returnUrl);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.href;
}

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isUnder(path: string, base: string): boolean {
  if (base === '' || base === '/' || path === base) return true;
  return path.startsWith(base.endsWith('/') ? base : `${base}/`);
}
