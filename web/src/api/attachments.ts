// Fotky a soubory nabídek a zakázek (SPEC §6.1): kategorie podle fáze práce, kladečský plán pro zákazníka.
import type { JobState } from './jobs'
import { api, unwrap, uploadTo } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type Attachment = S['Attachment']
export type AttachmentCategory = Attachment['category']
export type AttachmentPatch = S['AttachmentPatch']

/** Kategorie v pořadí průběhu zakázky. */
export const attachmentCategories: AttachmentCategory[] = ['before', 'during', 'after', 'plan', 'other']

export const categoryLabels: Record<AttachmentCategory, string> = {
  before: 'Před',
  during: 'Během',
  after: 'Hotovo',
  plan: 'Kladečský plán',
  other: 'Ostatní',
}

export const categoryHints: Record<AttachmentCategory, string> = {
  before: 'původní stav',
  during: 'během zhotovení',
  after: 'hotová zakázka',
  plan: 'obrázek nebo PDF',
  other: 'doklady, ostatní',
}

/** Výchozí kategorie fotky podle stavu zakázky. */
export function jobCategory(state: JobState): AttachmentCategory {
  switch (state) {
    case 'planned':
      return 'before'
    case 'in_progress':
      return 'during'
    case 'done':
    case 'invoiced':
      return 'after'
    default:
      return 'other'
  }
}

export type AttachmentTarget = { kind: 'jobs' | 'quotes'; id: number }

const pid = (slug: string, id: number) => ({ path: { slug, id } })

export const attachmentMutations = {
  upload: (slug: string, t: AttachmentTarget) => (v: { files: File[]; category: AttachmentCategory }) =>
    uploadTo(`/api/accounts/${slug}/${t.kind}/${t.id}/attachments?category=${v.category}`, v.files),
  patch: (slug: string) => (v: { id: number } & AttachmentPatch) => {
    const { id, ...body } = v
    return unwrap(api.PATCH('/api/accounts/{slug}/attachments/{id}', { params: pid(slug, id), body }))
  },
  remove: (slug: string) => (id: number) => unwrap(api.DELETE('/api/accounts/{slug}/attachments/{id}', { params: pid(slug, id) })),
}

/**
 * Uloží obrázek kladečského plánu (SPEC §5.6): nahraje ho do kategorie „Kladečský plán“, u nabídky ho případně
 * ukáže zákazníkovi a smaže předchozí verze (`replace`).
 */
export async function savePlanImage(slug: string, t: AttachmentTarget, file: File, shared: boolean, replace: Attachment[]): Promise<Attachment> {
  const [a] = await uploadTo<Attachment>(`/api/accounts/${slug}/${t.kind}/${t.id}/attachments?category=plan`, [file])
  if (!a) throw new Error('Plán se nepodařilo nahrát.')
  const saved = shared ? await attachmentMutations.patch(slug)({ id: a.id, shared: true }) : a
  for (const old of replace) if (old.id !== a.id) await attachmentMutations.remove(slug)(old.id)
  return saved
}

/** Předchozí obrázky plánu téže místnosti (stejné jméno souboru), které patří jen k cíli — ty se nahradí. */
export function previousPlans(attachments: Attachment[] | null | undefined, t: AttachmentTarget, filename: string): Attachment[] {
  return (attachments ?? []).filter(
    (a) => a.category === 'plan' && a.filename === filename && (t.kind === 'quotes' ? a.quote_id === t.id : a.job_id === t.id && !a.quote_id),
  )
}

export const isImage = (a: { content_type: string }) => a.content_type.startsWith('image/')
