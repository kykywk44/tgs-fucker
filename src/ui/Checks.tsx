import { useId } from 'react'
import { Check as CheckIcon, X as XIcon } from 'lucide-react'
import { Banner, BannerTitle } from '@/components/ui/banner'
import type { Check } from '@/core/checks'
import { cn } from '@/lib/utils'

export interface ChecksProps {
  checks: Check[]
}

export function Checks({ checks }: ChecksProps) {
  const titleId = useId()
  const failing = checks.some((check) => !check.ok)

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-subtitle font-semibold text-foreground">
        Проверки Telegram
      </h2>

      {/* Stays mounted so it can animate in and out as the checks flip. */}
      <Banner status="error" contrast="high" open={failing}>
        <BannerTitle>Экспорт недоступен</BannerTitle>
      </Banner>

      <ul className="flex flex-col gap-0.5">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 py-1 text-body">
            <span
              role="img"
              aria-label={check.ok ? 'Пройдена' : 'Не пройдена'}
              className={cn('flex size-4 shrink-0', check.ok ? 'text-success' : 'text-destructive')}
            >
              {check.ok ? (
                <CheckIcon className="size-4" strokeWidth={2.25} aria-hidden />
              ) : (
                <XIcon className="size-4" strokeWidth={2.25} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{check.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className={cn(!check.ok && 'text-destructive')}>{check.value}</span>
              {' / '}
              {check.limit}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
