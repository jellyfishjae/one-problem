import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import katex from 'katex'
import sampleProblems from './problems.json'
import { loadCollection, saveCollection, validateCollection, type Problem } from './collection'
import 'katex/dist/katex.min.css'
import './App.css'

type ActiveProblems = {
  kind: 'sample' | 'imported'
  problems: Problem[]
  currentIndex: number
  notes: Record<string, string>
}

const STORAGE_KEY = 'one-problem:current-problem'
const SAMPLE_STORAGE_KEY = 'one-problem:sample-current-problem'
const NOTES_KEY_PREFIX = 'one-problem:notes:'

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
  let savedId: string | null = null
  try {
    savedId = kind === 'sample'
      ? window.localStorage.getItem(SAMPLE_STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY)
      : window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Problems remain available when browser storage is unavailable.
  }

  const preferredIndex = problems.findIndex((problem) => problem.id === preferredId)
  const savedIndex = problems.findIndex((problem) => problem.id === savedId)
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
    problems,
    currentIndex: preferredIndex >= 0 ? preferredIndex : savedIndex >= 0 ? savedIndex : 0,
    notes,
  }
}

function App() {
  const [active, setActive] = useState<ActiveProblems | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const problem = active?.problems[active.currentIndex]
  const currentProblemId = problem?.id
  const activeKind = active?.kind

  useEffect(() => {
    let cancelled = false
    loadCollection()
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
    if (!currentProblemId || !activeKind) return
    try {
      window.localStorage.setItem(activeKind === 'sample' ? SAMPLE_STORAGE_KEY : STORAGE_KEY, currentProblemId)
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [currentProblemId, activeKind])

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
    setActive((current) => current && { ...current, currentIndex: current.currentIndex + offset })
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
      const collection = validateCollection(parsed)
      await saveCollection(collection)
      setActive(createActiveProblems(
        collection.problems,
        'imported',
        active?.kind === 'imported' ? problem?.id : undefined,
      ))
      setImportMessage(`Imported ${collection.problems.length} problems for offline use.`)
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
              <span className="chapter-name">{problem.chapter}</span>
              <span className="problem-count">
                {String(active.currentIndex + 1).padStart(2, '0')} / {String(active.problems.length).padStart(2, '0')}
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
              disabled={active.currentIndex === active.problems.length - 1}
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
