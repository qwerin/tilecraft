import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { quotePdfUrl } from '@/api/quotes'
import { Sheet } from '@/components/print-sheet'

// Tisk nabídky = PDF ze serveru (A4, logo, sekce, podmínky; internal/invoicepdf) — stránka na něj jen přesměruje.
export const Route = createFileRoute('/print/$slug/quotes/$id')({ component: PrintQuote })

function PrintQuote() {
  const { slug, id } = Route.useParams()
  const url = quotePdfUrl(slug, Number(id))
  useEffect(() => {
    window.location.replace(url)
  }, [url])
  return (
    <Sheet>
      <p className="text-neutral-500">
        Otevírám PDF nabídky… Pokud se neotevře, <a href={url} className="underline">klikněte sem</a>.
      </p>
    </Sheet>
  )
}
