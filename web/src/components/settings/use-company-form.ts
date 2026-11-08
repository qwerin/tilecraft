// Nastavení → Firma: společný stav formuláře (údaje firmy + nastavení nabídek a faktur, SPEC §2) a uložení (PATCH).
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import type { Account, Settings } from '@/api/types'

export type Company = Pick<
  Account,
  'name' | 'registration_no' | 'vat_no' | 'street' | 'city' | 'zip' | 'phone' | 'email' | 'web' | 'bank_account' | 'iban' | 'swift'
>

const companyKeys: (keyof Company)[] = [
  'name',
  'registration_no',
  'vat_no',
  'street',
  'city',
  'zip',
  'phone',
  'email',
  'web',
  'bank_account',
  'iban',
  'swift',
]

/** Číselná nastavení: [min, max] podle API. */
export const numberLimits = {
  quote_valid_days: [1, 365],
  invoice_due_days: [0, 365],
  invoice_digits: [3, 6],
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>
export type NumberSetting = keyof typeof numberLimits

const settingsDefaults: Settings = {
  vat_payer: false,
  default_vat_rate: 12,
  quote_valid_days: 30,
  quote_intro: '',
  quote_terms: '',
  invoice_due_days: 14,
  invoice_digits: 3,
  invoice_text: '',
}

export function useCompanyForm(slug: string, account: Account) {
  const qc = useQueryClient()
  const [c, setC] = useState<Company>(() => Object.fromEntries(companyKeys.map((k) => [k, account[k] ?? ''])) as Company)
  const [s, setS] = useState<Settings>(() => {
    const st = { ...settingsDefaults, ...account.settings }
    if (!st.invoice_digits) st.invoice_digits = 3
    return st
  })
  // číselná pole se edituji jako text (prázdné pole během psaní), ukládá se ořezané číslo
  const [nums, setNums] = useState<Record<NumberSetting, string>>(() => ({
    quote_valid_days: String(s.quote_valid_days),
    invoice_due_days: String(s.invoice_due_days),
    invoice_digits: String(s.invoice_digits),
  }))

  const setCo = (k: keyof Company, v: string) => setC((x) => ({ ...x, [k]: v }))
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }))
  const setNum = (k: NumberSetting, v: string) => setNums((x) => ({ ...x, [k]: v.replace(/\D/g, '') }))

  const settings = (): Settings => {
    const out = { ...s }
    for (const k of Object.keys(numberLimits) as NumberSetting[]) {
      const [min, max] = numberLimits[k]
      const n = Number(nums[k])
      out[k] = nums[k] === '' || !Number.isFinite(n) ? settingsDefaults[k] : Math.min(max, Math.max(min, n))
    }
    return out
  }

  // extra: co stránka ukládá navíc
  const save = useMutation({
    mutationFn: async (extra?: () => Promise<unknown>) => {
      const trimmed = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, (v ?? '').trim()])) as Company
      await unwrap(api.PATCH('/api/accounts/{slug}', { params: { path: { slug } }, body: { ...trimmed, settings: settings() } }))
      if (extra) await extra()
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [slug, 'account'] })
      toast.success('Uloženo')
    },
  })
  return { c, setCo, s, set, nums, setNum, save }
}
