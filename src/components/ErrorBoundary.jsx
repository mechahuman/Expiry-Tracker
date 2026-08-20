import { Component } from 'react'

/**
 * Last line of defence against a blank white screen.
 *
 * Matters more here than in a normal website: once this is installed to a home
 * screen it runs without a visible address bar, so a user who hits a render
 * error has no obvious way to retry and no URL to inspect. They need a button.
 *
 * Class component by necessity -- React has no hook equivalent of
 * componentDidCatch.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // No error-reporting service wired up, so the console is all we have.
    console.error('Unhandled error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="fatal-error">
        <h1>Something went wrong</h1>
        <p>The app hit an unexpected error. Reloading usually clears it.</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Reload the app
        </button>
        {/* Shown rather than hidden: without devtools on a phone this is the
            only clue available if the error keeps recurring. */}
        <pre className="fatal-error-detail">{String(this.state.error)}</pre>
      </div>
    )
  }
}
