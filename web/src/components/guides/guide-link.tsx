import { Link } from '@tanstack/react-router'
import { BookOpenIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useFirm } from '@/hooks/use-firm'
import type { GuideId } from '@/lib/guides'
import { cn } from '@/lib/utils'

/** Malý odkaz „Návod“ do hlavičky stránky; `section` = kotva oddílu návodu, `compact` = na telefonu jen ikona. */
export function GuideLink({ topic, section, compact, className }: { topic: GuideId; section?: string; compact?: boolean; className?: string }) {
  const { slug } = useFirm()
  return (
    <Link
      to="/a/$slug/guides/$topic"
      params={{ slug, topic }}
      hash={section}
      title="Návod k této stránce"
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground hover:text-foreground', className)}
    >
      <BookOpenIcon /> <span className={compact ? 'max-sm:sr-only' : undefined}>Návod</span>
    </Link>
  )
}
