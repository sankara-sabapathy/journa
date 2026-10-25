import { db as defaultDb, type JournaDB } from '../db/db'

/** Journa's own questions, rotated by date. Not stored: it ships with the app. */
export const DEFAULT_SET_ID = 'default'

export interface QuestionSet {
  id: string
  name: string
  /** Asked in this order; each answer is written under its question. */
  questions: string[]
  updatedAt: number
}

const SETS_KEY = 'journal.questionSets'
const ACTIVE_KEY = 'journal.activeSet'

/** One question per line: trimmed, blanks and repeats dropped. */
export function parseQuestions(text: string): string[] {
  const seen = new Set<string>()
  const questions: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const question = line.trim()
    const folded = question.toLocaleLowerCase()
    if (!question || seen.has(folded)) continue
    seen.add(folded)
    questions.push(question)
  }
  return questions
}

function isSet(value: unknown): value is QuestionSet {
  const s = value as QuestionSet | null
  return Boolean(
    s &&
      typeof s.id === 'string' &&
      typeof s.name === 'string' &&
      Array.isArray(s.questions) &&
      s.questions.every((q) => typeof q === 'string') &&
      typeof s.updatedAt === 'number',
  )
}

const byName = (a: QuestionSet, b: QuestionSet) => a.name.localeCompare(b.name)

export function createSetsStore(database: JournaDB = defaultDb) {
  async function read(): Promise<QuestionSet[]> {
    const row = await database.settings.get(SETS_KEY)
    return Array.isArray(row?.value) ? (row.value as unknown[]).filter(isSet) : []
  }

  async function write(sets: QuestionSet[]): Promise<void> {
    await database.settings.put({ key: SETS_KEY, value: sets })
  }

  async function storedActive(): Promise<string> {
    const row = await database.settings.get(ACTIVE_KEY)
    return typeof row?.value === 'string' ? row.value : DEFAULT_SET_ID
  }

  /** Resolves the stored choice against what exists, falling back to Journa's own questions. */
  async function activeId(): Promise<string> {
    const id = await storedActive()
    if (id === DEFAULT_SET_ID) return id
    return (await read()).some((s) => s.id === id) ? id : DEFAULT_SET_ID
  }

  async function setActive(id: string): Promise<void> {
    await database.settings.put({ key: ACTIVE_KEY, value: id })
  }

  return {
    /** Every set the user wrote, by name. */
    async list(): Promise<QuestionSet[]> {
      return (await read()).sort(byName)
    },

    activeId,

    /** The set Today asks from; null means Journa's own questions. */
    async active(): Promise<QuestionSet | null> {
      const id = await activeId()
      if (id === DEFAULT_SET_ID) return null
      return (await read()).find((s) => s.id === id) ?? null
    },

    setActive,

    /** Creates a set, or replaces one by id. Empty questions are dropped. */
    async save(input: { id?: string; name: string; questions: string[] }): Promise<QuestionSet> {
      const set: QuestionSet = {
        id: input.id ?? crypto.randomUUID(),
        name: input.name.trim(),
        questions: parseQuestions(input.questions.join('\n')),
        updatedAt: Date.now(),
      }
      await database.transaction('rw', database.settings, async () => {
        const sets = await read()
        await write([...sets.filter((s) => s.id !== set.id), set])
      })
      return set
    },

    async remove(id: string): Promise<void> {
      await database.transaction('rw', database.settings, async () => {
        await write((await read()).filter((s) => s.id !== id))
        if ((await storedActive()) === id) await setActive(DEFAULT_SET_ID)
      })
    },

    /** Keeps the newer copy of each set, adds new ones, and adopts the chosen set if it still exists. */
    async merge(incoming: QuestionSet[], active?: string): Promise<void> {
      await database.transaction('rw', database.settings, async () => {
        const sets = await read()
        for (const set of incoming) {
          if (!isSet(set)) continue
          const at = sets.findIndex((s) => s.id === set.id)
          if (at === -1) sets.push(set)
          else if (set.updatedAt > sets[at].updatedAt) sets[at] = set
        }
        await write(sets)
        if (active && active !== DEFAULT_SET_ID && exists(sets, active)) await setActive(active)
      })
    },

    /** Drops every local set for an incoming list, for a replace import. */
    async replaceAll(incoming: QuestionSet[], active?: string): Promise<void> {
      await database.transaction('rw', database.settings, async () => {
        const sets = incoming.filter(isSet)
        await write(sets)
        await setActive(active && exists(sets, active) ? active : DEFAULT_SET_ID)
      })
    },
  }
}

function exists(sets: QuestionSet[], id: string): boolean {
  return id === DEFAULT_SET_ID || sets.some((s) => s.id === id)
}

export const setsStore = createSetsStore()
