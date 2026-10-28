import { chapterKey, type Problem } from './collection.ts'

export type Chapter = {
  key: string
  name: string
  problems: Problem[]
  number?: number
}

export type Selection = {
  chapterKey: string
  currentIndex: number
  lastByChapter: Record<string, string>
}

const STORAGE_KEY = 'one-problem:current-problem'
const SAMPLE_STORAGE_KEY = 'one-problem:sample-current-problem'
const ACTIVE_CHAPTER_KEY = 'one-problem:active-chapter'
const CHAPTER_PROGRESS_PREFIX = 'one-problem:chapter-current:'
export const NOTES_KEY_PREFIX = 'one-problem:notes:'

function chapterProgressKey(key: string) {
  return `${CHAPTER_PROGRESS_PREFIX}${encodeURIComponent(key)}`
}

export function groupChapters(problems: Problem[]): Chapter[] {
  const chapters = new Map<string, Chapter>()
  for (const problem of problems) {
    const key = chapterKey(problem)
    let chapter = chapters.get(key)
    if (!chapter) {
      chapter = { key, name: problem.chapter, problems: [], number: problem.chapterNumber }
      chapters.set(key, chapter)
    }
    chapter.problems.push(problem)
  }
  return [...chapters.values()]
    .sort((a, b) => a.number !== undefined && b.number !== undefined ? a.number - b.number : 0)
    .map((chapter) => ({ ...chapter, problems: [...chapter.problems].sort((a, b) => a.number - b.number) }))
}

export function restoreSelection(
  chapters: Chapter[],
  kind: 'sample' | 'imported',
  storage: Pick<Storage, 'getItem'> | null,
  preferredId?: string,
): Selection {
  let savedId: string | null = null
  let savedChapter: string | null = null
  const lastByChapter: Record<string, string> = {}
  try {
    savedId = kind === 'sample'
      ? storage?.getItem(SAMPLE_STORAGE_KEY) ?? storage?.getItem(STORAGE_KEY) ?? null
      : storage?.getItem(STORAGE_KEY) ?? null
    if (kind === 'imported') {
      savedChapter = storage?.getItem(ACTIVE_CHAPTER_KEY) ?? null
      for (const chapter of chapters) {
        const lastId = storage?.getItem(chapterProgressKey(chapter.key))
        if (lastId && chapter.problems.some((problem) => problem.id === lastId)) {
          lastByChapter[chapter.key] = lastId
        }
      }
    }
  } catch {
    // Reading progress is optional when browser storage is unavailable.
  }

  const preferredChapter = chapters.find((chapter) => chapter.problems.some((problem) => problem.id === preferredId))
  const storedChapter = chapters.find((chapter) => chapter.key === savedChapter)
  const legacyChapter = chapters.find((chapter) => chapter.problems.some((problem) => problem.id === savedId))
  const chapter = preferredChapter ?? storedChapter ?? legacyChapter ?? chapters[0]
  const currentIndex = [preferredId, lastByChapter[chapter.key], savedId]
    .map((id) => chapter.problems.findIndex((problem) => problem.id === id))
    .find((position) => position >= 0) ?? -1
  const index = currentIndex >= 0 ? currentIndex : 0
  lastByChapter[chapter.key] = chapter.problems[index].id
  return { chapterKey: chapter.key, currentIndex: index, lastByChapter }
}

export function saveSelection(selection: Selection, chapters: Chapter[], kind: 'sample' | 'imported', storage: Storage) {
  const chapter = chapters.find((item) => item.key === selection.chapterKey)
  const problemId = chapter?.problems[selection.currentIndex]?.id
  if (!problemId) return
  if (kind === 'sample') {
    storage.setItem(SAMPLE_STORAGE_KEY, problemId)
  } else {
    storage.setItem(STORAGE_KEY, problemId)
    storage.setItem(ACTIVE_CHAPTER_KEY, selection.chapterKey)
    for (const item of chapters) {
      const lastId = item.key === selection.chapterKey ? problemId : selection.lastByChapter[item.key]
      if (lastId && item.problems.some((problem) => problem.id === lastId)) {
        storage.setItem(chapterProgressKey(item.key), lastId)
      }
    }
  }
}

export function navigateSelection(selection: Selection, chapters: Chapter[], offset: number): Selection {
  const chapter = chapters.find((item) => item.key === selection.chapterKey)
  if (!chapter) return selection
  const nextIndex = selection.currentIndex + offset
  if (nextIndex < 0 || nextIndex >= chapter.problems.length) return selection
  return {
    ...selection,
    currentIndex: nextIndex,
    lastByChapter: { ...selection.lastByChapter, [selection.chapterKey]: chapter.problems[nextIndex].id },
  }
}

export function selectProgressChapter(selection: Selection, chapters: Chapter[], key: string): Selection {
  if (key === selection.chapterKey) return selection
  const selected = chapters.find((item) => item.key === key)
  const outgoing = chapters.find((item) => item.key === selection.chapterKey)
  if (!selected) return selection
  const lastByChapter = { ...selection.lastByChapter }
  const outgoingId = outgoing?.problems[selection.currentIndex]?.id
  if (outgoingId) lastByChapter[selection.chapterKey] = outgoingId
  const nextIndex = selected.problems.findIndex((item) => item.id === lastByChapter[key])
  return {
    chapterKey: key,
    currentIndex: nextIndex >= 0 ? nextIndex : 0,
    lastByChapter,
  }
}
