import { nativeTheme } from 'electron'
import type { ThemePreference } from '../../shared/settings'

// Must match --app-bg in src/styles/index.css so the window never flashes a wrong color.
const LIGHT_BACKGROUND = '#f3f3f3'
const DARK_BACKGROUND = '#202020'

/**
 * Applies the theme preference at the Chromium level. The renderer's CSS reacts
 * to `prefers-color-scheme`, which follows `nativeTheme.themeSource`, so the
 * correct theme is active before the first frame and no script is needed.
 */
export function applyThemePreference(preference: ThemePreference): void {
  nativeTheme.themeSource = preference
}

export function windowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : LIGHT_BACKGROUND
}
