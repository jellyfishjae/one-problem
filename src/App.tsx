import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import katex from 'katex'
import sampleProblems from './problems.json'
import { importCollection, loadLibrary, type Problem } from './collection'
import {
  groupChapters,
  navigateSelection,
  NOTES_KEY_PREFIX,
  restoreSelection,
  saveSelection,
  selectProgressChapter,
  selectProgressProblem,
  type Chapter,
} from './progress'
import {
  PROBLEM_STATUSES,
  readProblemMetadata,
  saveBookmark,
  saveProblemStatus,
  type ProblemMetadata,
  type ProblemStatus,
} from './problemMetadata'
import 'katex/dist/katex.min.css'
import './App.css'

type ActiveProblems = ProblemMetadata & {
  kind: 'sample' | 'imported'
  chapters: Chapter[]
  chapterKey: string
  currentIndex: number
  lastByChapter: Record<string, string>
  notes: Record<string, string>
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.75h12v16.5l-6-4-6 4V3.75Z" />
    </svg>
  )
}

function renderStatement(statement: string) {
  return statement.split(/(\$[^$]+\$)/g).map((part, index) => {
    if (part.startsWith('$') && part.endsWith('$')) {
      return (
        <span
          key={index}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(part.slice(1, -1), { throwOnError: false }),
          }}
        />
      )
    }

    return part
  })
}

function createActiveProblems(
  problems: Problem[],
  kind: ActiveProblems['kind'],
  preferredId?: string,
): ActiveProblems {
  const chapters = kind === 'imported'
    ? groupChapters(problems)
    : [{ key: 'sample', name: '', problems }]
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    // Problems remain usable when browser storage is unavailable.
  }
  const selection = restoreSelection(chapters, kind, storage, preferredId)
  const metadata = readProblemMetadata(problems, storage)
  const notes: Record<string, string> = {}
  try {
    for (const problem of problems) {
      const note = window.localStorage.getItem(`${NOTES_KEY_PREFIX}${problem.id}`)
      if (note !== null) notes[problem.id] = note
    }
  } catch {
    // Notes remain usable for this session when browser storage is unavailable.
  }

  return {
    kind,
    chapters,
    ...selection,
    ...metadata,
    notes,
  }
}

function App() {
  const [active, setActive] = useState<ActiveProblems | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const chapter = active?.chapters.find((item) => item.key === active.chapterKey)
  const problem = chapter?.problems[active?.currentIndex ?? 0]
  const bookmarkedProblems = active?.chapters.flatMap((item) =>
    item.problems.filter((entry) => active.bookmarks[entry.id]).map((entry) => ({ chapter: item, problem: entry })),
  ) ?? []

  useEffect(() => {
    let cancelled = false
    loadLibrary()
      .then((collection) => {
        if (!cancelled) {
          setActive(collection
            ? createActiveProblems(collection.problems, 'imported')
            : createActiveProblems(sampleProblems, 'sample'))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActive(createActiveProblems(sampleProblems, 'sample'))
          setImportMessage('Saved problems could not be opened. Showing sample problems.')
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!active || !problem) return
    try {
      saveSelection(active, active.chapters, active.kind, window.localStorage)
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [active, problem])

  function updateNote(value: string) {
    if (!problem) return
    const problemId = problem.id
    setActive((current) => current && {
      ...current,
      notes: { ...current.notes, [problemId]: value },
    })

    try {
      window.localStorage.setItem(`${NOTES_KEY_PREFIX}${problemId}`, value)
    } catch {
      // Keep the note in React state if browser storage is unavailable.
    }
  }

  function updateStatus(status: ProblemStatus) {
    if (!problem) return
    const problemId = problem.id
    setActive((current) => current && {
      ...current,
      statuses: { ...current.statuses, [problemId]: status },
    })
    try {
      saveProblemStatus(problemId, status, window.localStorage)
    } catch {
      // Keep the status in React state if browser storage is unavailable.
    }
  }

  function toggleBookmark() {
    if (!problem || !active) return
    const problemId = problem.id
    const bookmarked = !active.bookmarks[problemId]
    setActive((current) => {
      if (!current) return current
      const bookmarks = { ...current.bookmarks }
      if (bookmarked) bookmarks[problemId] = true
      else delete bookmarks[problemId]
      return { ...current, bookmarks }
    })
    try {
      saveBookmark(problemId, bookmarked, window.localStorage)
    } catch {
      // Keep the bookmark in React state if browser storage is unavailable.
    }
  }

  function navigate(offset: number) {
    setActive((current) => current && { ...current, ...navigateSelection(current, current.chapters, offset) })
    setImportMessage('')
  }

  function selectChapter(key: string) {
    setActive((current) => {
      if (!current || current.kind !== 'imported') return current
      return { ...current, ...selectProgressChapter(current, current.chapters, key) }
    })
    setImportMessage('')
  }

  function openBookmarkedProblem(id: string) {
    setActive((current) => current && {
      ...current,
      ...selectProgressProblem(current, current.chapters, id),
    })
    setShowBookmarks(false)
    setImportMessage('')
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        throw new Error('Choose a valid JSON file.')
      }
      const collection = await importCollection(parsed)
      setActive((current) => {
        const selected = current?.chapters.find((item) => item.key === current.chapterKey)
        const preferredId = current?.kind === 'imported' ? selected?.problems[current.currentIndex]?.id : undefined
        const next = createActiveProblems(collection.problems, 'imported', preferredId)
        return current ? {
          ...next,
          notes: { ...next.notes, ...current.notes },
          statuses: { ...next.statuses, ...current.statuses },
          bookmarks: { ...next.bookmarks, ...current.bookmarks },
        } : next
      })
      setImportMessage(`Imported problems. ${collection.problems.length} are available offline across ${groupChapters(collection.problems).length} chapters.`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Could not import this collection.')
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">One Problem<span className="wordmark-dot">.</span></span>
        <div className="header-actions">
          <span className="header-note">A quiet place to think</span>
          <button
            type="button"
            className="header-link"
            onClick={() => setShowBookmarks((visible) => !visible)}
            disabled={!active}
            aria-label={showBookmarks ? 'Close bookmarks' : 'View bookmarks'}
            aria-expanded={showBookmarks}
          >
            <BookmarkIcon filled={showBookmarks} />
            <span className="header-link-text">Bookmarks</span>
          </button>
          <button
            type="button"
            className="import-button"
            onClick={() => fileInput.current?.click()}
            disabled={!active}
          >
            Import JSON
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-hidden="true"
            tabIndex={-1}
            onChange={importFile}
          />
        </div>
      </header>

      {importMessage && <p className="import-message" role="status">{importMessage}</p>}

      {active && showBookmarks ? (
        <main className="bookmarks-view">
          <div className="bookmarks-heading">
            <h1>Bookmarks</h1>
            <button type="button" className="back-button" onClick={() => setShowBookmarks(false)}>
              Back to problem
            </button>
          </div>
          {bookmarkedProblems.length > 0 ? (
            <ul className="bookmarks-list">
              {bookmarkedProblems.map((item) => (
                <li key={item.problem.id}>
                  <button type="button" onClick={() => openBookmarkedProblem(item.problem.id)}>
                    <span className="bookmark-chapter">{item.chapter.name || 'Sample problems'}</span>
                    <span className="bookmark-problem">Problem {item.problem.number}<span aria-hidden="true">→</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bookmarks-empty">Bookmarked problems will appear here.</p>
          )}
        </main>
      ) : active && problem ? (
        <>
          <main className="problem-view">
            <div className="chapter-line">
              {active.kind === 'imported' ? (
                <div className="chapter-selector">
                  <select
                    aria-label="Choose chapter"
                    value={active.chapterKey}
                    onChange={(event) => selectChapter(event.target.value)}
                  >
                    {active.chapters.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name} · {item.problems.length} {item.problems.length === 1 ? 'problem' : 'problems'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="chapter-name">{problem.chapter}</span>
              )}
              <span className="problem-count">
                {String(active.currentIndex + 1).padStart(2, '0')} / {String(chapter?.problems.length ?? 0).padStart(2, '0')}
              </span>
            </div>

            <article className="problem-content" aria-live="polite">
              <div className="problem-heading">
                <p className="problem-label">Problem {problem.number}</p>
                <button
                  type="button"
                  className="bookmark-button"
                  onClick={toggleBookmark}
                  aria-label={`${active.bookmarks[problem.id] ? 'Remove bookmark from' : 'Bookmark'} problem ${problem.number}`}
                  aria-pressed={Boolean(active.bookmarks[problem.id])}
                  title={active.bookmarks[problem.id] ? 'Remove bookmark' : 'Bookmark problem'}
                >
                  <BookmarkIcon filled={Boolean(active.bookmarks[problem.id])} />
                </button>
              </div>
              <h1>{renderStatement(problem.statement)}</h1>
              {problem.figure && (
                <figure className="problem-figure">
                  <img src={problem.figure.src} alt={problem.figure.alt} />
                  <figcaption>{problem.figure.caption}</figcaption>
                </figure>
              )}
            </article>

            <div className="status-section">
              <label htmlFor="problem-status">Status</label>
              <select
                id="problem-status"
                aria-label={`Status for problem ${problem.number}`}
                value={active.statuses[problem.id] ?? 'Not Started'}
                onChange={(event) => updateStatus(event.target.value as ProblemStatus)}
              >
                {PROBLEM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            <details className="notes-section">
              <summary>My Thoughts</summary>
              <textarea
                aria-label={`Notes for problem ${problem.number}`}
                value={active.notes[problem.id] ?? ''}
                onChange={(event) => updateNote(event.target.value)}
                placeholder="Write down what you notice..."
                rows={6}
              />
            </details>
          </main>

          <nav className="problem-navigation" aria-label="Problem navigation">
            <button
              type="button"
              className="nav-button previous-button"
              onClick={() => navigate(-1)}
              disabled={active.currentIndex === 0}
            >
              <span aria-hidden="true">←</span> Previous
            </button>
            <button
              type="button"
              className="nav-button next-button"
              onClick={() => navigate(1)}
              disabled={active.currentIndex === (chapter?.problems.length ?? 0) - 1}
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </nav>
        </>
      ) : (
        <main className="problem-view"><p className="loading-message">Opening problems…</p></main>
      )}
    </div>
  )
}

export default App
