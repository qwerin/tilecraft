import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, FileTextIcon, HardHatIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon, PlusIcon, ReceiptTextIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { customerAddress, customerMutations, useCustomer } from '@/api/customers'
import { useFirmMutation } from '@/api/queries'
import { useQuotes } from '@/api/quotes'
import { Confirm, PageHeader, Panel } from '@/components/common'
import { CustomerFormDialog } from '@/components/customers/customer-form'
import { QuoteList } from '@/components/quotes/quote-list'
import { Button } from '@/components/ui/button'
import { useFirm } from '@/hooks/use-firm'

// Detail zákazníka: kontakty, jeho nabídky, odkazy na zakázky a faktury.
export const Route = createFileRoute('/a/$slug/customers_/$id')({ component: CustomerPage })

function CustomerPage() {
  const { slug } = useFirm()
  const id = Number(Route.useParams().id)
  const navigate = useNavigate()
  const { data: c, isError } = useCustomer(slug, id)
  const quotes = useQuotes(slug, { customer_id: id })
  const [editing, setEditing] = useState(false)
  const remove = useFirmMutation(slug, customerMutations.remove(slug), [['customers']])

  if (isError) return <p className="text-sm text-muted-foreground">Zákazník nebyl nalezen.</p>
  if (!c) return null
  const address = customerAddress(c)
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/a/$slug/customers" params={{ slug }} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Zákazníci
      </Link>
      <PageHeader
        title={c.name}
        description={c.contact_person ? `Kontakt: ${c.contact_person}` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Upravit
            </Button>
            <Button nativeButton={false} render={<Link to="/a/$slug/quotes/new" params={{ slug }} search={{ customer_id: c.id }} />}>
              <PlusIcon /> Nová nabídka
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel title={`Nabídky${c.quotes ? ` (${c.quotes})` : ''}`}>
          <QuoteList slug={slug} items={quotes.data?.items} empty="Zákazník zatím nemá žádnou nabídku." compact />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Kontakt">
            <ul className="flex flex-col gap-2 text-sm">
              {c.phone && (
                <li className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-muted-foreground" />
                  <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:underline">
                    {c.phone}
                  </a>
                </li>
              )}
              {c.email && (
                <li className="flex items-center gap-2">
                  <MailIcon className="size-4 text-muted-foreground" />
                  <a href={`mailto:${c.email}`} className="truncate hover:underline">
                    {c.email}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2">
                  <MapPinIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <a href={`https://mapy.cz/zakladni?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {address}
                  </a>
                </li>
              )}
              {(c.registration_no || c.vat_no) && (
                <li className="text-muted-foreground">
                  {c.registration_no && `IČO ${c.registration_no}`}
                  {c.registration_no && c.vat_no && ' · '}
                  {c.vat_no && `DIČ ${c.vat_no}`}
                </li>
              )}
              {!c.phone && !c.email && !address && <li className="text-muted-foreground">Bez kontaktních údajů.</li>}
            </ul>
            {c.note && <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">{c.note}</p>}
          </Panel>
          <Panel title="Další doklady">
            <div className="flex flex-col gap-1">
              <Button variant="ghost" className="justify-start" nativeButton={false} render={<Link to="/a/$slug/quotes" params={{ slug }} search={{ customer_id: c.id }} />}>
                <FileTextIcon /> Nabídky ({c.quotes})
              </Button>
              <Button variant="ghost" className="justify-start" nativeButton={false} render={<Link to="/a/$slug/jobs" params={{ slug }} search={{ q: c.name }} />}>
                <HardHatIcon /> Zakázky ({c.jobs})
              </Button>
              <Button variant="ghost" className="justify-start" nativeButton={false} render={<Link to="/a/$slug/invoices" params={{ slug }} search={{ customer_id: c.id }} />}>
                <ReceiptTextIcon /> Faktury ({c.invoices})
              </Button>
            </div>
          </Panel>
          <Confirm
            title="Smazat zákazníka?"
            description={c.quotes + c.jobs + c.invoices > 0 ? 'Zákazník má doklady, smazat ho nepůjde.' : 'Zákazník bude nevratně smazán.'}
            onConfirm={() =>
              remove.mutateAsync(c.id).then(() => {
                toast.success('Zákazník smazán')
                navigate({ to: '/a/$slug/customers', params: { slug } })
              }, () => {})
            }
            trigger={(open) => (
              <Button variant="ghost" className="self-start text-destructive" onClick={open} disabled={c.quotes + c.jobs + c.invoices > 0}>
                <Trash2Icon /> Smazat zákazníka
              </Button>
            )}
          />
        </div>
      </div>
      {editing && <CustomerFormDialog slug={slug} customer={c} onClose={() => setEditing(false)} />}
    </div>
  )
}
