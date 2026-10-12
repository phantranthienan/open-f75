import { useId, type ReactNode } from 'react'
import { cn } from '@/ui/lib/utils'

/** A terminal-style pane: a bordered box with its title set into the top border. */
export function Pane({
  title,
  meta,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: string
  /** Short status shown next to the title, in the border. */
  meta?: ReactNode
  /** Small controls set into the top border, on the right. */
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('relative flex min-h-0 flex-col rounded-md border', className)}>
      <div className="absolute -top-2.5 right-3 left-3 flex min-w-0 items-center gap-1 text-xs leading-5">
        <h2 id={id} className="shrink-0 bg-background px-1.5 font-semibold tracking-[0.18em] text-primary uppercase">
          {title}
        </h2>
        {meta && <span className="min-w-0 truncate bg-background px-1.5 text-muted-foreground">{meta}</span>}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-0.5 bg-background px-1">{actions}</div>}
      </div>
      <div className={cn('min-h-0 flex-1 overflow-auto px-3 pt-4 pb-3', bodyClassName)}>{children}</div>
    </section>
  )
}
