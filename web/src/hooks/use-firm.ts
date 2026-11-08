import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { accountQuery } from '@/api/queries'
import type { Account, Role } from '@/api/types'
import { isManager } from '@/lib/format'

/**
 * Aktuální firma (načtená v layoutu /a/$slug, proto vždy k dispozici).
 * isManager: vlastník nebo kancelář — vidí ceny, nabídky, faktury, ceník a nastavení.
 * isWorker: parťák — jen Přehled a Zakázky bez cen.
 */
export function useFirm(): { slug: string; account: Account; role: Role; isManager: boolean; isWorker: boolean } {
  const { slug } = useParams({ from: '/a/$slug' })
  const { data } = useQuery(accountQuery(slug))
  const account = data!
  const role = account.role as Role
  return { slug, account, role, isManager: isManager(role), isWorker: !isManager(role) }
}
