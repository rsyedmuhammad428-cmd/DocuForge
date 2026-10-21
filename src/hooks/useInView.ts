import { useEffect, useState } from 'react'

/** Reports whether an element is on screen (or about to be), so work can wait until it is needed. */
export function useInView<T extends Element>(rootMargin = '300px') {
  const [node, setNode] = useState<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (node === null) return
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[entries.length - 1]?.isIntersecting ?? false),
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, rootMargin])

  return { ref: setNode, inView }
}
