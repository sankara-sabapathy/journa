export interface StorageInfo {
  persisted: boolean
  usage: number | null
  quota: number | null
}

/** Ask the browser not to evict our data. Granted silently for installed PWAs in most browsers. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageInfo(): Promise<StorageInfo> {
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  const est = await navigator.storage?.estimate?.()
  return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null }
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
