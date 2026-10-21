const MAX_LINE_LENGTH = 32 * 1024 * 1024

/**
 * Turns arbitrary chunks of text from a stream into complete lines.
 * A line can arrive split across chunks, and one chunk can hold several lines.
 */
export function createLineSplitter(
  onLine: (line: string) => void,
  onOverflow: () => void = () => undefined,
) {
  let buffer = ''

  return {
    push(chunk: string): void {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line.trim() !== '') onLine(line)
        newline = buffer.indexOf('\n')
      }
      if (buffer.length > MAX_LINE_LENGTH) {
        buffer = ''
        onOverflow()
      }
    },
    flush(): void {
      if (buffer.trim() !== '') onLine(buffer.replace(/\r$/, ''))
      buffer = ''
    },
  }
}
