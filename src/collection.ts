export type Problem = {
  id: string
  chapter: string
  chapterNumber?: number
  number: number
  sourcePage?: number
  statement: string
  figure?: {
    src: string
    alt: string
    caption: string
  }
  hints: string[]
  solution: string | null
}

export type Collection = {
  format: 'one-problem-collection'
  version: 1
  problems: Problem[]
}

const DB_NAME = 'one-problem'
const DB_VERSION = 2
const LEGACY_STORE = 'collections'
const LEGACY_KEY = 'active'
const LIBRARY_STORE = 'library'
const LIBRARY_KEY = 'problems'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateCollection(value: unknown): Collection {
  if (!isRecord(value) || value.format !== 'one-problem-collection' || value.version !== 1) {
    throw new Error('This is not a supported One Problem collection.')
  }
  if (!Array.isArray(value.problems) || value.problems.length === 0) {
    throw new Error('The collection needs at least one problem.')
  }

  const ids = new Set<string>()
  const problems: Problem[] = value.problems.map((item, index) => {
    const position = index + 1
    if (
      !isRecord(item) ||
      !isNonemptyString(item.id) ||
      !isNonemptyString(item.chapter) ||
      !Number.isInteger(item.number) ||
      (item.number as number) < 0 ||
      !isNonemptyString(item.statement)
    ) {
      throw new Error(`Problem ${position} has missing or invalid fields.`)
    }
    if (ids.has(item.id)) throw new Error(`Problem ${position} has a duplicate ID.`)
    ids.add(item.id)

    if (item.hints !== undefined && (!Array.isArray(item.hints) || !item.hints.every((hint) => typeof hint === 'string'))) {
      throw new Error(`Problem ${position} has invalid hints.`)
    }
    if (item.solution !== undefined && item.solution !== null && typeof item.solution !== 'string') {
      throw new Error(`Problem ${position} has an invalid solution field.`)
    }

    let figure: Problem['figure']
    if (item.figure !== undefined) {
      if (
        !isRecord(item.figure) ||
        !isNonemptyString(item.figure.src) ||
        !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.figure.src) ||
        !isNonemptyString(item.figure.alt) ||
        !isNonemptyString(item.figure.caption)
      ) {
        throw new Error(`Problem ${position} needs an embedded PNG, JPEG, or WebP diagram.`)
      }
      figure = {
        src: item.figure.src,
        alt: item.figure.alt,
        caption: item.figure.caption,
      }
    }

    return {
      id: item.id,
      chapter: item.chapter,
      ...(Number.isInteger(item.chapterNumber) ? { chapterNumber: item.chapterNumber as number } : {}),
      number: item.number as number,
      ...(Number.isInteger(item.sourcePage) ? { sourcePage: item.sourcePage as number } : {}),
      statement: item.statement,
      ...(figure ? { figure } : {}),
      hints: (item.hints as string[] | undefined) ?? [],
      solution: (item.solution as string | null | undefined) ?? null,
    }
  })

  return { format: 'one-problem-collection', version: 1, problems }
}

export function chapterKey(problem: Problem): string {
  return JSON.stringify([problem.chapterNumber ?? null, problem.chapter])
}

export function mergeCollections(current: Collection | null, incoming: Collection): Collection {
  const validated = validateCollection(incoming)
  const problems = new Map<string, Problem>()
  for (const problem of current?.problems ?? []) problems.set(problem.id, problem)

  for (const problem of validated.problems) {
    const existing = problems.get(problem.id)
    if (existing && chapterKey(existing) !== chapterKey(problem)) {
      throw new Error(`Problem ${problem.id} already belongs to another chapter.`)
    }
    problems.set(problem.id, problem)
  }

  return validateCollection({ format: 'one-problem-collection', version: 1, problems: [...problems.values()] })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let blocked = false
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LEGACY_STORE)) request.result.createObjectStore(LEGACY_STORE)
      if (!request.result.objectStoreNames.contains(LIBRARY_STORE)) request.result.createObjectStore(LIBRARY_STORE)
    }
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other One Problem tabs, then try again.'))
    }
    request.onsuccess = () => {
      if (blocked) {
        request.result.close()
      } else {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

async function readOrMergeLibrary(incoming?: Collection): Promise<Collection | null> {
  const database = await openDatabase()
  try {
    return await new Promise<Collection | null>((resolve, reject) => {
      const transaction = database.transaction([LEGACY_STORE, LIBRARY_STORE], 'readwrite')
      const library = transaction.objectStore(LIBRARY_STORE)
      let result: Collection | null = null
      let failure: unknown

      function abort(error: unknown) {
        failure = error
        transaction.abort()
      }

      function finish(value: unknown, fromLegacy: boolean) {
        try {
          const current = value === undefined ? null : validateCollection(value)
          result = incoming ? mergeCollections(current, incoming) : current
          if (result && (incoming || fromLegacy)) library.put(result, LIBRARY_KEY)
        } catch (error) {
          abort(error)
        }
      }

      const request = library.get(LIBRARY_KEY)
      request.onsuccess = () => {
        if (request.result !== undefined) {
          finish(request.result, false)
          return
        }
        const legacy = transaction.objectStore(LEGACY_STORE).get(LEGACY_KEY)
        legacy.onsuccess = () => finish(legacy.result, true)
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Could not save the problem library.'))
    })
  } finally {
    database.close()
  }
}

export function loadLibrary(): Promise<Collection | null> {
  return readOrMergeLibrary()
}

export async function importCollection(value: unknown): Promise<Collection> {
  const incoming = validateCollection(value)
  const merged = await readOrMergeLibrary(incoming)
  if (!merged) throw new Error('Could not save the problem library.')
  return merged
}
