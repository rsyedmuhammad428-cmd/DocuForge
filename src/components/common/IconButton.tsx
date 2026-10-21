import type { ReactNode } from 'react'

export function IconButton(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded-control p-2 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  )
}
