import { attachmentCategories, jobCategory } from '@/api/attachments'
import type { Job } from '@/api/jobs'
import { AttachmentsPanel } from '@/components/attachments/attachments-panel'

/** Fotky zakázky po fázích (před / během / hotovo), kladečský plán a soubory; i fotky z nabídky. Nahrává i parťák. */
export function JobPhotos({ slug, job, isManager }: { slug: string; job: Job; isManager: boolean }) {
  return (
    <AttachmentsPanel
      key={job.state} // nová fáze zakázky = nová výchozí kategorie
      slug={slug}
      target={{ kind: 'jobs', id: job.id }}
      attachments={job.attachments}
      categories={attachmentCategories}
      defaultCategory={jobCategory(job.state)}
      isManager={isManager}
      invalidate={[['jobs'], ['quotes']]}
      title="Fotky"
      empty="Zatím žádné fotky. Vyfoťte stav před, během a po práci."
    />
  )
}
