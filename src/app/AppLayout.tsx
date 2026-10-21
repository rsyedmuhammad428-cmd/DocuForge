import { Outlet } from 'react-router'
import { Sidebar } from '../components/layout/Sidebar'
import { StatusBar } from '../components/layout/StatusBar'
import { TopBar } from '../components/layout/TopBar'

export function AppLayout() {
  // A button, not an "#main" link: the app uses hash routing, so a hash link would change the route.
  function skipToContent() {
    document.getElementById('main')?.focus()
  }

  return (
    <div className="flex h-full">
      <button
        type="button"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to main content
      </button>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
        <StatusBar />
      </div>
    </div>
  )
}
