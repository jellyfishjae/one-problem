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
const STORE_NAME = 'collections'
const ACTIVE_KEY = 'active'

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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadCollection(): Promise<Collection | null> {
  const database = await openDatabase()
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(ACTIVE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return value === undefined ? null : validateCollection(value)
  } finally {
    database.close()
  }
}

export async function saveCollection(collection: Collection): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(collection, ACTIVE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}
