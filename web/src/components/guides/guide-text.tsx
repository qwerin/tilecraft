import { Fragment } from 'react'
import { splitLabels, uiIcons } from '@/lib/guides'

/** Popisek tlačítka nebo pole z aplikace (s ikonou, když ji tlačítko má). */
export function UiLabel({ children }: { children: string }) {
  const Icon = uiIcons[children]
  return (
    <span className="mx-px inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-px align-baseline text-[0.92em] font-medium whitespace-nowrap text-foreground shadow-xs">
      {Icon && <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />}
      {children !== '⚙' && children !== '⋮' ? children : <span className="sr-only">{children === '⚙' ? 'Podrobnosti řádku' : 'Další akce'}</span>}
    </span>
  )
}

/** Text návodu: [[Popisek]] se vykreslí jako tlačítko z aplikace. */
export function GuideText({ text }: { text: string }) {
  return (
    <>
      {splitLabels(text).map((p, i) => (
        <Fragment key={i}>{p.label ? <UiLabel>{p.text}</UiLabel> : p.text}</Fragment>
      ))}
    </>
  )
}
