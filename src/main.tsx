import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { App } from './app/App'
import { JobsProvider } from './hooks/useJobs'
import { SettingsProvider } from './hooks/useSettings'
import './styles/index.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Root element not found.')
}

// HashRouter is required because the packaged app loads index.html from disk (file://).
createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <SettingsProvider>
        <JobsProvider>
          <App />
        </JobsProvider>
      </SettingsProvider>
    </HashRouter>
  </StrictMode>,
)
