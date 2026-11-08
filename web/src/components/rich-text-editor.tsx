// WYSIWYG editor pro krátké formátované texty (úvod a podmínky nabídky). Umí jen to, co projde
// sanitizací na serveru: nadpisy, odstavce, tučné, kurzívu a odrážky/číslování (bez odkazů a obrázků).
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { BoldIcon, Heading2Icon, Heading3Icon, ItalicIcon, ListIcon, ListOrderedIcon, PilcrowIcon, Redo2Icon, Undo2Icon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { richTextClass } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
  }),
]

export function RichTextEditor({ value, onChange, className, id }: { value: string; onChange: (html: string) => void; className?: string; id?: string }) {
  // value je jen počáteční obsah; po změně zvenku editor remountujte (key)
  const editor = useEditor({
    extensions,
    content: value,
    editorProps: { attributes: { class: cn('min-h-48 px-3 py-2 text-sm outline-none', richTextClass), ...(id ? { id } : {}) } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      p: e.isActive('paragraph'),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  const tool = (Icon: LucideIcon, title: string, active: boolean, run: () => void, disabled = false) => (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-sm"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // výběr v editoru zůstane
      onClick={run}
    >
      <Icon />
    </Button>
  )
  return (
    <div className={cn('rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
        {tool(Heading2Icon, 'Nadpis', s.h2, () => chain().toggleHeading({ level: 2 }).run())}
        {tool(Heading3Icon, 'Podnadpis', s.h3, () => chain().toggleHeading({ level: 3 }).run())}
        {tool(PilcrowIcon, 'Odstavec', s.p, () => chain().setParagraph().run())}
        <span className="mx-1 h-5 w-px bg-border" />
        {tool(BoldIcon, 'Tučně (Ctrl+B)', s.bold, () => chain().toggleBold().run())}
        {tool(ItalicIcon, 'Kurzíva (Ctrl+I)', s.italic, () => chain().toggleItalic().run())}
        <span className="mx-1 h-5 w-px bg-border" />
        {tool(ListIcon, 'Odrážky', s.bullet, () => chain().toggleBulletList().run())}
        {tool(ListOrderedIcon, 'Číslovaný seznam', s.ordered, () => chain().toggleOrderedList().run())}
        <span className="mx-1 h-5 w-px bg-border" />
        {tool(Undo2Icon, 'Zpět (Ctrl+Z)', false, () => chain().undo().run(), !s.undo)}
        {tool(Redo2Icon, 'Znovu (Ctrl+Shift+Z)', false, () => chain().redo().run(), !s.redo)}
      </div>
      <EditorContent editor={editor} className="max-h-[60vh] overflow-y-auto" />
    </div>
  )
}
