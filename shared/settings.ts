import { z } from 'zod'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

export const ThemePreferenceSchema = z.enum(THEME_PREFERENCES)
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>

/**
 * Shape of the settings file. Every field falls back to its default when it is
 * missing or invalid, so a damaged file can never prevent the app from starting.
 */
export const SettingsSchema = z.object({
  theme: ThemePreferenceSchema.catch('system'),
  /** Where save and folder dialogs start. null means "no preference". */
  defaultOutputFolder: z.string().min(1).nullable().catch(null),
  /** Keep a list of finished jobs (file names and where results were saved, never contents). */
  saveHistory: z.boolean().catch(true),
  /** Remove leftover temporary files from earlier runs when the app starts. */
  cleanupTempFiles: z.boolean().catch(true),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultOutputFolder: null,
  saveHistory: true,
  cleanupTempFiles: true,
}

/**
 * A partial update sent from the renderer. Unknown keys are rejected.
 * The renderer may only clear the default output folder. Setting one goes through a
 * native folder dialog in the main process, so the page cannot invent paths.
 */
export const SettingsUpdateSchema = z.strictObject({
  theme: ThemePreferenceSchema.optional(),
  defaultOutputFolder: z.null().optional(),
  saveHistory: z.boolean().optional(),
  cleanupTempFiles: z.boolean().optional(),
})
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>

/** Converts untrusted data (for example a parsed settings file) into valid settings. */
export function parseSettings(raw: unknown): Settings {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}
  return SettingsSchema.parse(source)
}
