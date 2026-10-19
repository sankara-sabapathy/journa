import { useSyncExternalStore } from 'react'

/** Hash routes keep the app fully static and offline-friendly. */
export type Route =
  | { name: 'today'; date?: string }
  | { name: 'notes'; tag?: string }
  | { name: 'tasks' }
  | { name: 'lists' }
  | { name: 'journal' }
  | { name: 'search' }
  | { name: 'settings' }
  | { name: 'trash' }
  | { name: 'entry'; id: string }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const [head, arg] = path.split('/')
  const params = new URLSearchParams(query)
  switch (head) {
    case 'notes':
      return { name: 'notes', tag: params.get('tag') ?? undefined }
    case 'tasks':
    case 'lists':
    case 'journal':
    case 'search':
    case 'settings':
    case 'trash':
      return { name: head }
    case 'entry':
      return arg ? { name: 'entry', id: arg } : { name: 'today' }
    case 'today':
      return { name: 'today', date: /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : undefined }
    default:
      return { name: 'today' }
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'today':
      return route.date ? `#/today/${route.date}` : '#/today'
    case 'notes':
      return route.tag ? `#/notes?tag=${encodeURIComponent(route.tag)}` : '#/notes'
    case 'entry':
      return `#/entry/${route.id}`
    default:
      return `#/${route.name}`
  }
}

export function navigate(route: Route) {
  location.hash = href(route)
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return parseRoute(hash)
}
