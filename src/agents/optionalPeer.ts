/** True when Node failed to resolve an optional peer dependency. */
export function isOptionalPeerModuleNotFound(err: unknown, specifier?: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as NodeJS.ErrnoException).code
  const looksLikeMissingModule =
    code === 'ERR_MODULE_NOT_FOUND' ||
    message.includes('Cannot find package') ||
    message.includes('Cannot find module')
  if (!looksLikeMissingModule) return false
  if (!specifier) return true
  return message.includes(specifier)
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
