const NAMES: Record<string, string> = {
  eng: 'English',
  urd: 'Urdu',
  ara: 'Arabic',
  fas: 'Persian',
  pus: 'Pashto',
  hin: 'Hindi',
  ben: 'Bengali',
  pan: 'Punjabi',
  fra: 'French',
  deu: 'German',
  spa: 'Spanish',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  tur: 'Turkish',
  nld: 'Dutch',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  jpn: 'Japanese',
  kor: 'Korean',
}

/** "English (eng)" for known codes, otherwise just the code. */
export function languageLabel(code: string): string {
  const name = NAMES[code]
  return name === undefined ? code : `${name} (${code})`
}

/** English if it is installed, otherwise the first installed language. */
export function defaultLanguages(installed: readonly string[]): string[] {
  if (installed.includes('eng')) return ['eng']
  const first = installed[0]
  return first === undefined ? [] : [first]
}
