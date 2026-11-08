import { cn } from '@/lib/utils'

/** Vzhled formátovaného textu (editor i zobrazení uloženého HTML). */
export const richTextClass = cn(
  'leading-relaxed [&_p]:my-1.5 [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[1.35em] [&_h2]:font-bold [&_h2:first-child]:mt-0',
  '[&_h3]:mt-3.5 [&_h3]:mb-1 [&_h3]:text-[1.1em] [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold',
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li_p]:my-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_hr]:my-3',
)
