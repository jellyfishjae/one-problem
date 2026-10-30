import type { Problem } from './collection.ts'

export const PROBLEM_STATUSES = ['Not Started', 'Still Thinking', 'Solved', 'Skipped'] as const
export type ProblemStatus = typeof PROBLEM_STATUSES[number]

export type ProblemMetadata = {
  statuses: Record<string, ProblemStatus>
  bookmarks: Record<string, boolean>
}

const STATUS_KEY_PREFIX = 'one-problem:status:'
const BOOKMARK_KEY_PREFIX = 'one-problem:bookmark:'

export function readProblemMetadata(
  problems: Problem[],
  storage: Pick<Storage, 'getItem'> | null,
): ProblemMetadata {
  const metadata: ProblemMetadata = { statuses: {}, bookmarks: {} }
  try {
    for (const problem of problems) {
      const status = storage?.getItem(`${STATUS_KEY_PREFIX}${problem.id}`)
      if (PROBLEM_STATUSES.some((value) => value === status)) {
        metadata.statuses[problem.id] = status as ProblemStatus
      }
      if (storage?.getItem(`${BOOKMARK_KEY_PREFIX}${problem.id}`) === 'true') {
        metadata.bookmarks[problem.id] = true
      }
    }
  } catch {
    // Saved metadata remains optional when browser storage is unavailable.
  }
  return metadata
}

export function saveProblemStatus(id: string, status: ProblemStatus, storage: Pick<Storage, 'setItem' | 'removeItem'>) {
  const key = `${STATUS_KEY_PREFIX}${id}`
  if (status === 'Not Started') storage.removeItem(key)
  else storage.setItem(key, status)
}

export function saveBookmark(id: string, bookmarked: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'>) {
  const key = `${BOOKMARK_KEY_PREFIX}${id}`
  if (bookmarked) storage.setItem(key, 'true')
  else storage.removeItem(key)
}
