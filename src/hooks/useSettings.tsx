import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Settings, SettingsUpdate, ThemePreference } from '../../shared/settings'
import { bridge, errorMessage } from '../lib/bridge'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; settings: Settings }
  | { status: 'error'; message: string }

interface SettingsContextValue {
  state: LoadState
  /** Message from the most recent failed save, or null. */
  saveError: string | null
  setTheme: (theme: ThemePreference) => Promise<void>
  /** Opens a folder dialog and remembers the choice as the default output folder. */
  chooseOutputFolder: () => Promise<void>
  clearOutputFolder: () => Promise<void>
  /** Changes the history and cleanup switches. */
  updateSetting: (patch: SettingsUpdate) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    bridge
      .getSettings()
      .then((settings) => {
        if (!cancelled) setState({ status: 'ready', settings })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setTheme = useCallback(async (theme: ThemePreference) => {
    try {
      const settings = await bridge.updateSettings({ theme })
      setState({ status: 'ready', settings })
      setSaveError(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }, [])

  const chooseOutputFolder = useCallback(async () => {
    try {
      setState({ status: 'ready', settings: await bridge.chooseOutputFolder() })
      setSaveError(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }, [])

  const clearOutputFolder = useCallback(async () => {
    try {
      setState({ status: 'ready', settings: await bridge.updateSettings({ defaultOutputFolder: null }) })
      setSaveError(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }, [])

  const updateSetting = useCallback(async (patch: SettingsUpdate) => {
    try {
      setState({ status: 'ready', settings: await bridge.updateSettings(patch) })
      setSaveError(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }, [])

  const value = useMemo(
    () => ({ state, saveError, setTheme, chooseOutputFolder, clearOutputFolder, updateSetting }),
    [state, saveError, setTheme, chooseOutputFolder, clearOutputFolder, updateSetting],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (context === null) {
    throw new Error('useSettings must be used inside SettingsProvider.')
  }
  return context
}
