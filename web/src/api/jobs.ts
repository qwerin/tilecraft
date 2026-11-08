// Zakázky (SPEC §6): seznam a kalendář, detail, stav, deník, fotky. Parťák dostává ceny nulové.
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import type { BadgeTone } from '@/components/common'
import { api, unwrap, uploadTo } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type Job = S['Job']
export type JobSummary = S['JobSummary']
export type JobInput = S['JobInput']
export type JobLine = S['Line']
export type LineInput = S['LineInput']
export type JobNote = S['JobNote']
export type Attachment = S['Attachment']
export type JobState = Job['state']

/** Stavy v pořadí průběhu; `cancelled` je mimo. */
export const jobFlow: JobState[] = ['planned', 'in_progress', 'done', 'invoiced']

export const jobStateLabels: Record<JobState, string> = {
  planned: 'Domluvená',
  in_progress: 'Probíhá',
  done: 'Hotová',
  invoiced: 'Vyfakturovaná',
  cancelled: 'Zrušená',
}

export const jobStateTones: Record<JobState, BadgeTone> = {
  planned: 'info',
  in_progress: 'primary',
  done: 'success',
  invoiced: 'neutral',
  cancelled: 'outline',
}

/** Barva pruhu v kalendáři (Tailwind třídy pozadí + textu). */
export const jobStateBar: Record<JobState, string> = {
  planned: 'bg-accent text-accent-foreground ring-1 ring-inset ring-foreground/10',
  in_progress: 'bg-primary text-primary-foreground',
  done: 'bg-success text-success-foreground',
  invoiced: 'bg-muted text-muted-foreground ring-1 ring-inset ring-foreground/10',
  cancelled: 'bg-transparent text-muted-foreground ring-1 ring-inset ring-dashed ring-muted-foreground/40 line-through',
}

const p = (slug: string) => ({ path: { slug } })
const pid = (slug: string, id: number) => ({ path: { slug, id } })

export type JobListParams = { state?: string; q?: string; from?: string; to?: string; page?: number; per_page?: number }

export function useJobs(slug: string, query: JobListParams) {
  return useQuery({
    queryKey: [slug, 'jobs', 'list', query],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/jobs', { params: { ...p(slug), query } })),
    placeholderData: keepPreviousData,
  })
}

export const jobQuery = (slug: string, id: number) =>
  queryOptions({
    queryKey: [slug, 'jobs', id],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/jobs/{id}', { params: pid(slug, id) })),
  })

export const jobMutations = {
  setState: (slug: string, id: number) => (state: Exclude<JobState, 'invoiced'>) =>
    unwrap(api.POST('/api/accounts/{slug}/jobs/{id}/state', { params: pid(slug, id), body: { state } })),
  update: (slug: string, id: number) => (body: JobInput) => unwrap(api.PUT('/api/accounts/{slug}/jobs/{id}', { params: pid(slug, id), body })),
  remove: (slug: string, id: number) => () => unwrap(api.DELETE('/api/accounts/{slug}/jobs/{id}', { params: pid(slug, id) })),
  addNote: (slug: string, id: number) => (body: { on?: string; text: string }) =>
    unwrap(api.POST('/api/accounts/{slug}/jobs/{id}/notes', { params: pid(slug, id), body })),
  deleteNote: (slug: string) => (noteId: number) => unwrap(api.DELETE('/api/accounts/{slug}/job-notes/{id}', { params: pid(slug, noteId) })),
  upload: (slug: string, id: number) => (files: File[]) => uploadTo(`/api/accounts/${slug}/jobs/${id}/attachments`, files),
  deleteAttachment: (slug: string) => (attId: number) => unwrap(api.DELETE('/api/accounts/{slug}/attachments/{id}', { params: pid(slug, attId) })),
}

/** Řádek zakázky → vstup pro PUT (zachová vazbu na ceník, měření z místností, prořez, slevu i poznámku). */
export function lineToInput(l: JobLine): LineInput {
  return {
    section: l.section,
    catalog_item_id: l.catalog_item_id ?? undefined,
    name: l.name,
    unit: l.unit,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount,
    customer_supplied: l.customer_supplied,
    measure: l.measure as LineInput['measure'],
    rooms: l.rooms,
    waste: l.waste,
    note: l.note,
  }
}

/** Kompletní vstup pro PUT /jobs/{id} z načtené zakázky (jen vlastník/kancelář — parťák má ceny nulové). */
export function jobToInput(j: Job, patch: Partial<JobInput> = {}): JobInput {
  return {
    customer_id: j.customer.id,
    title: j.title,
    site_address: j.site_address,
    site_contact: j.site_contact,
    start_on: j.start_on,
    end_on: j.end_on,
    note: j.note,
    vat_rate: j.vat_rate,
    discount: j.discount,
    worker_ids: j.worker_ids,
    rooms: j.rooms,
    lines: j.lines.map(lineToInput),
    ...patch,
  }
}

/** Odkaz na navigaci k adrese stavby (na telefonu otevře mapovou aplikaci). */
export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Telefon pro odkaz tel: (bez mezer). */
export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export const isImage = (a: Attachment) => a.content_type.startsWith('image/')
