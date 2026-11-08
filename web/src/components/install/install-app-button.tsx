import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstallAction } from './use-install-action'

/** Tlačítko „Nainstalovat“ (jen na telefonu/tabletu, kde to prohlížeč umí, a mimo nainstalovanou aplikaci). */
export function InstallAppButton({ className }: { className?: string }) {
  const { available, run, dialog } = useInstallAction()
  if (!available) return null
  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={run}>
        <DownloadIcon /> Nainstalovat
      </Button>
      {dialog}
    </>
  )
}
