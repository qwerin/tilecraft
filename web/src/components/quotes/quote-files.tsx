import type { Quote } from '@/api/quotes'
import { AttachmentsPanel } from '@/components/attachments/attachments-panel'

/** Fotky původního stavu a kladečský plán nabídky; po vytvoření zakázky jsou i u ní. Plán lze ukázat zákazníkovi. */
export function QuoteFiles({ slug, quote }: { slug: string; quote: Quote }) {
  return (
    <AttachmentsPanel
      slug={slug}
      target={{ kind: 'quotes', id: quote.id }}
      attachments={quote.attachments}
      categories={['before', 'plan', 'other']}
      defaultCategory="before"
      isManager
      canShare
      invalidate={[['quotes'], ['jobs']]}
      empty="Vyfoťte původní stav nebo nahrajte kladečský plán (obrázek, PDF). Plán můžete ukázat zákazníkovi v nabídce."
    />
  )
}
