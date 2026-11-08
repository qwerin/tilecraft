import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { invoicePdfUrl } from '@/api/invoices'
import { Sheet } from '@/components/print-sheet'

// Tisk faktury = PDF z backendu (stejný doklad, jaký dostane zákazník e-mailem); prohlížeč ho otevře ve svém prohlížeči PDF.
export const Route = createFileRoute('/print/$slug/invoices/$id')({
  component: PrintInvoice,
})

function PrintInvoice() {
  const { slug, id } = Route.useParams()
  const url = invoicePdfUrl(slug, Number(id))
  useEffect(() => {
    window.location.replace(url)
  }, [url])
  return (
    <Sheet>
      <p className="text-neutral-500">
        Otevírám PDF faktury… Pokud se neotevře,{' '}
        <a href={url} className="underline">
          klikněte sem
        </a>
        .
      </p>
    </Sheet>
  )
}
