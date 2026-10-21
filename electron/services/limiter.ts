/** Runs at most `max` tasks at once; the rest wait their turn in the order they arrived. */
export function createLimiter(max: number) {
  let active = 0
  const waiting: Array<() => void> = []

  const next = (): void => {
    const start = waiting.shift()
    if (start !== undefined) start()
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      next()
    }
  }
}
