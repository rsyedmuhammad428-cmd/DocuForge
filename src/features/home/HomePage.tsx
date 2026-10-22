import { History, ShieldCheck } from 'lucide-react'
import { useJobs } from '../../hooks/useJobs'
import { Link } from 'react-router'
import { StatusBadge } from '../../components/common/StatusBadge'
import { NAV_ITEMS, TOOL_IDS } from '../registry'

const JOB_STATUS_LABEL = {
  queued: 'Waiting',
  running: 'Working',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const

const TOOLS = TOOL_IDS.flatMap((id) => NAV_ITEMS.find((item) => item.id === id) ?? [])

export function HomePage() {
  const { jobs } = useJobs()

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-8">
      <section>
        <h2 className="text-xl font-semibold">Welcome to DocuForge</h2>
        <p className="mt-1 max-w-prose text-muted">
          Merge, split, organize, compress, convert and read your documents on this computer, without
          uploading them anywhere.
        </p>
      </section>

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-3 text-base font-semibold">
          What do you want to do?
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                to={tool.path}
                className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-4 hover:bg-surface-hover"
              >
                <div className="flex items-center gap-3">
                  <tool.icon size={20} className="text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">{tool.label}</span>
                  <StatusBadge status={tool.status} />
                </div>
                <p className="text-sm text-muted">{tool.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-base font-semibold">
          Recent jobs
        </h2>
        {jobs.length === 0 ? (
          <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 text-muted">
            <History size={20} aria-hidden="true" />
            <p>No jobs yet in this session. Earlier jobs are in Recent Files.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {jobs.slice(0, 5).map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0 truncate">{job.title}</span>
                <span className="shrink-0 text-sm text-muted">{JOB_STATUS_LABEL[job.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-2 text-sm text-muted">
        <ShieldCheck size={16} aria-hidden="true" />
        Documents are processed on this computer. DocuForge has no cloud features.
      </p>
    </div>
  )
}
