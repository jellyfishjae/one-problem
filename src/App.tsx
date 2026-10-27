import { useEffect, useState } from 'react'
import problems from './problems.json'
import './App.css'

const STORAGE_KEY = 'one-problem:current-problem'
const NOTES_KEY_PREFIX = 'one-problem:notes:'

function getInitialProblemIndex() {
  try {
    const savedId = window.localStorage.getItem(STORAGE_KEY)
    const savedIndex = problems.findIndex((problem) => problem.id === savedId)
    return savedIndex >= 0 ? savedIndex : 0
  } catch {
    return 0
  }
}

function getInitialNotes(): Record<string, string> {
  const savedNotes: Record<string, string> = {}

  try {
    for (const problem of problems) {
      const note = window.localStorage.getItem(`${NOTES_KEY_PREFIX}${problem.id}`)
      if (note !== null) savedNotes[problem.id] = note
    }
  } catch {
    // Notes remain usable for this session when browser storage is unavailable.
  }

  return savedNotes
}

function App() {
  const [currentIndex, setCurrentIndex] = useState(getInitialProblemIndex)
  const [notes, setNotes] = useState(getInitialNotes)
  const problem = problems[currentIndex]

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, problem.id)
    } catch {
      // The app still works when browser storage is unavailable.
    }
  }, [problem.id])

  function updateNote(value: string) {
    setNotes((currentNotes) => ({ ...currentNotes, [problem.id]: value }))

    try {
      window.localStorage.setItem(`${NOTES_KEY_PREFIX}${problem.id}`, value)
    } catch {
      // Keep the note in React state if browser storage is unavailable.
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">One Problem<span className="wordmark-dot">.</span></span>
        <span className="header-note">A quiet place to think</span>
      </header>

      <main className="problem-view">
        <div className="chapter-line">
          <span className="chapter-name">{problem.chapter}</span>
          <span className="problem-count">
            {String(currentIndex + 1).padStart(2, '0')} / {String(problems.length).padStart(2, '0')}
          </span>
        </div>

        <article className="problem-content" aria-live="polite">
          <p className="problem-label">Problem {String(problem.number).padStart(2, '0')}</p>
          <h1>{problem.prompt}</h1>
        </article>

        <details className="notes-section">
          <summary>My Thoughts</summary>
          <textarea
            aria-label={`Notes for problem ${problem.number}`}
            value={notes[problem.id] ?? ''}
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
          onClick={() => setCurrentIndex((index) => index - 1)}
          disabled={currentIndex === 0}
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <button
          type="button"
          className="nav-button next-button"
          onClick={() => setCurrentIndex((index) => index + 1)}
          disabled={currentIndex === problems.length - 1}
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </nav>
    </div>
  )
}

export default App
