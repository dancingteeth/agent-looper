/** npm package name for an import specifier (drops subpath exports). */
export function optionalPeerBasePackage(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
    return specifier
  }
  const slash = specifier.indexOf('/')
  return slash === -1 ? specifier : specifier.slice(0, slash)
}

/** Package name from Node's `Cannot find package '…'` / `"…"` message, if present. */
export function quotedMissingPackageName(message: string): string | null {
  const match = message.match(/Cannot find package ['"]([^'"]+)['"]/)
  return match?.[1] ?? null
}

function missingPackageMatchesPeer(message: string, specifier: string): boolean {
  const quoted = quotedMissingPackageName(message)
  if (!quoted) return false
  const peerBase = optionalPeerBasePackage(specifier)
  const missingBase = optionalPeerBasePackage(quoted)
  return missingBase === peerBase
}

/** True when Node failed to resolve an optional peer dependency. */
export function isOptionalPeerModuleNotFound(err: unknown, specifier?: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const message = err instanceof Error ? err.message : String(err)
  if (!specifier) {
    return quotedMissingPackageName(message) !== null
  }
  return missingPackageMatchesPeer(message, specifier)
}

export function missingOptionalPeerMessage(
  runtime: string,
  packages: string | readonly string[],
): string {
  const pkgs = typeof packages === 'string' ? [packages] : [...packages]
  const names = pkgs.length === 1 ? pkgs[0]! : pkgs.join(' + ')
  const install = `pnpm add -D ${pkgs.join(' ')}`
  return `Runtime "${runtime}" needs ${names}: ${install}`
}

export async function importOptionalPeer<T = Record<string, unknown>>(
  specifier: string,
  runtime: string,
  packages: string | readonly string[],
): Promise<T> {
  try {
    return (await import(specifier)) as T
  } catch (err) {
    if (isOptionalPeerModuleNotFound(err, specifier)) {
      throw new Error(missingOptionalPeerMessage(runtime, packages))
    }
    throw err
  }
}
