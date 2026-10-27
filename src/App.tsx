import { useEffect, useState } from 'react'
import problems from './problems.json'
import './App.css'

const STORAGE_KEY = 'one-problem:current-problem'

function getInitialProblemIndex() {
  try {
    const savedId = window.localStorage.getItem(STORAGE_KEY)
    const savedIndex = problems.findIndex((problem) => problem.id === savedId)
    return savedIndex >= 0 ? savedIndex : 0
  } catch {
    return 0
  }
}

function App() {
  const [currentIndex, setCurrentIndex] = useState(getInitialProblemIndex)
  const problem = problems[currentIndex]

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, problem.id)
    } catch {
      // The app still works when browser storage is unavailable.
    }
  }, [problem.id])

  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">One Problem<span className="wordmark-dot">.</span></span>
        <span className="header-note">A quiet place to think</span>
      </header>

      <main className="problem-view" aria-live="polite">
        <div className="chapter-line">
          <span className="chapter-name">{problem.chapter}</span>
          <span className="problem-count">
            {String(currentIndex + 1).padStart(2, '0')} / {String(problems.length).padStart(2, '0')}
          </span>
        </div>

        <article className="problem-content">
          <p className="problem-label">Problem {String(problem.number).padStart(2, '0')}</p>
          <h1>{problem.prompt}</h1>
        </article>
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
