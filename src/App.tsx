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
  type Chapter,
} from './progress'
import 'katex/dist/katex.min.css'
import './App.css'

type ActiveProblems = {
  kind: 'sample' | 'imported'
  chapters: Chapter[]
  chapterKey: string
  currentIndex: number
  lastByChapter: Record<string, string>
  notes: Record<string, string>
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
    notes,
  }
}

function App() {
  const [active, setActive] = useState<ActiveProblems | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const chapter = active?.chapters.find((item) => item.key === active.chapterKey)
  const problem = chapter?.problems[active?.currentIndex ?? 0]

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
        return createActiveProblems(collection.problems, 'imported', preferredId)
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

      {active && problem ? (
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
              <p className="problem-label">Problem {problem.number}</p>
              <h1>{renderStatement(problem.statement)}</h1>
              {problem.figure && (
                <figure className="problem-figure">
                  <img src={problem.figure.src} alt={problem.figure.alt} />
                  <figcaption>{problem.figure.caption}</figcaption>
                </figure>
              )}
            </article>

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
