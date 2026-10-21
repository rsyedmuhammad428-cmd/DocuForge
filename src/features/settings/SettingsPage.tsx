import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ToolsStatus } from '../../../shared/ipc'
import { Button } from '../../components/common/Button'
import { Notice } from '../../components/common/Notice'
import { ThemeSelector } from '../../components/common/ThemeSelector'
import { useSettings } from '../../hooks/useSettings'
import { bridge, errorMessage } from '../../lib/bridge'
import { languageLabel } from '../ocr/languages'

type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string }

function useLoaded<T>(load: () => Promise<T>): [Loaded<T>, () => void] {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    load()
      .then((value) => {
        if (!cancelled) setState({ status: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])
  return [state, reload]
}

export function SettingsPage() {
  const { state, saveError, chooseOutputFolder, clearOutputFolder, updateSetting } = useSettings()
  const [info] = useLoaded<AppInfo>(bridge.getAppInfo)
  const [tools, recheckTools] = useLoaded<ToolsStatus>(bridge.getToolsStatus)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [historyMessage, setHistoryMessage] = useState<string | null>(null)

  const settings = state.status === 'ready' ? state.settings : null

  async function clearHistory() {
    setConfirmingClear(false)
    try {
      await bridge.clearHistory()
      setHistoryMessage('History was cleared. Your files were not touched.')
    } catch (error) {
      setHistoryMessage(errorMessage(error))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted">System follows your Windows color mode.</p>
        <div className="mt-4">
          <ThemeSelector showLabels />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="mt-3 text-sm">
            Settings could not be loaded: {state.message}
          </p>
        )}
        {saveError !== null && (
          <p role="alert" className="mt-3 text-sm">
            A setting could not be saved: {saveError}
          </p>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Output</h2>
        <p className="mt-1 text-sm text-muted">
          Save and folder dialogs start here. You still choose the exact location each time.
        </p>
        <p className="mt-3 break-all text-sm">
          {settings !== null && settings.defaultOutputFolder !== null
            ? settings.defaultOutputFolder
            : 'Not set. Dialogs start in your Documents folder.'}
        </p>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void chooseOutputFolder()} disabled={settings === null}>
            Choose folder
          </Button>
          <Button
            onClick={() => void clearOutputFolder()}
            disabled={settings === null || settings.defaultOutputFolder === null}
          >
            Clear
          </Button>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">History and cleanup</h2>
        <div className="mt-3 space-y-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings?.saveHistory ?? true}
              disabled={settings === null}
              onChange={(event) => void updateSetting({ saveHistory: event.target.checked })}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block">Keep a history of finished jobs</span>
              <span className="block text-sm text-muted">
                Saves file names and where results were saved (up to 200 jobs). Never the contents of
                your documents or recognized text. Turning this off stops new entries; use Clear to
                remove existing ones.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {!confirmingClear ? (
              <Button onClick={() => setConfirmingClear(true)}>Clear history</Button>
            ) : (
              <>
                <p className="text-sm">Remove all history entries? Your files are not deleted.</p>
                <Button variant="primary" onClick={() => void clearHistory()}>
                  Yes, clear it
                </Button>
                <Button onClick={() => setConfirmingClear(false)}>Cancel</Button>
              </>
            )}
          </div>
          {historyMessage !== null && (
            <p role="status" className="text-sm">
              {historyMessage}
            </p>
          )}

          <label className="flex items-start gap-3 border-t border-border pt-3">
            <input
              type="checkbox"
              checked={settings?.cleanupTempFiles ?? true}
              disabled={settings === null}
              onChange={(event) => void updateSetting({ cleanupTempFiles: event.target.checked })}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block">Clean up leftover temporary files when DocuForge starts</span>
              <span className="block text-sm text-muted">
                Jobs remove their own temporary files. This also removes any that a crash left behind,
                but only DocuForge's own files that are more than an hour old.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Optional programs</h2>
        <p className="mt-1 text-sm text-muted">
          DocuForge works without these. They add features and are free.
        </p>
        {tools.status === 'loading' && <p className="mt-3 text-muted">Looking…</p>}
        {tools.status === 'error' && (
          <div className="mt-3">
            <Notice>{tools.message}</Notice>
          </div>
        )}
        {tools.status === 'ready' && (
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-3 text-sm">
            <dt className="font-medium">Tesseract (OCR)</dt>
            <dd>
              {tools.value.tesseract.found ? (
                <>
                  Found.{' '}
                  {tools.value.tesseract.languages.length > 0
                    ? `Languages: ${tools.value.tesseract.languages.map(languageLabel).join(', ')}.`
                    : 'No language data found.'}
                </>
              ) : (
                'Not found. Needed to read scanned documents.'
              )}
            </dd>
            <dt className="font-medium">LibreOffice</dt>
            <dd>
              {tools.value.libreoffice
                ? 'Found. Used for the closest Word to PDF layout, and for .doc, .odt and .rtf files.'
                : 'Not found. Word to PDF still works for .docx with basic layout.'}
            </dd>
          </dl>
        )}
        <div className="mt-3">
          <Button onClick={recheckTools}>Check again</Button>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">About</h2>
        {info.status === 'loading' && <p className="mt-3 text-muted">Loading…</p>}
        {info.status === 'error' && (
          <p role="alert" className="mt-3 text-sm">
            Application details could not be loaded: {info.message}
          </p>
        )}
        {info.status === 'ready' && (
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Version</dt>
            <dd>{info.value.version}</dd>
            <dt className="text-muted">Electron</dt>
            <dd>{info.value.electronVersion}</dd>
            <dt className="text-muted">License</dt>
            <dd>GNU Affero General Public License v3.0</dd>
          </dl>
        )}
      </section>
    </div>
  )
}
