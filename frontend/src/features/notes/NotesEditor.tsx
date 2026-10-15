import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline as UnderlineIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type MutableRefObject } from 'react'

/** The empty document serialises as `<p></p>`; the API stores an empty note as "". */
export function normalizeHtml(editor: Editor): string {
  return editor.isEmpty ? '' : editor.getHTML()
}

interface NotesEditorProps {
  /** Saved HTML to start from. */
  initialHtml: string
  /** Called with the normalised HTML after every user edit. */
  onChange: (html: string) => void
  /** Called once with the normalised HTML the editor actually holds after loading. */
  onLoaded: (html: string, editor: Editor) => void
  /** Escape hatch for tests and for replacing the content after a conflict. */
  editorRef?: MutableRefObject<Editor | null>
}

function ToolButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Keep the selection in the editor when a toolbar button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md p-2 transition-colors ${
        active
          ? 'bg-surface-3 text-text-primary'
          : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
      }`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')

  // The editor does not re-render React on every transaction, so subscribe to just the
  // formatting state the toolbar shows. Without this the pressed states would never update.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      link: e.isActive('link'),
      linkHref: (e.getAttributes('link').href as string | undefined) ?? '',
      heading: e.isActive('heading', { level: 1 })
        ? '1'
        : e.isActive('heading', { level: 2 })
          ? '2'
          : e.isActive('heading', { level: 3 })
            ? '3'
            : '0',
    }),
  })
  const heading = active.heading

  function applyLink() {
    const href = url.trim()
    if (href) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
    setLinkOpen(false)
  }

  return (
    <div className="border-b border-border">
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-0.5 p-1.5"
      >
        <label className="sr-only" htmlFor="note-style">
          Text style
        </label>
        <select
          id="note-style"
          value={heading}
          onChange={(e) => {
            const level = Number(e.target.value)
            const chain = editor.chain().focus()
            if (level === 0) chain.setParagraph().run()
            else chain.setHeading({ level: level as 1 | 2 | 3 }).run()
          }}
          className="mr-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="0">Normal</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <ToolButton
          label="Bold"
          icon={Bold}
          active={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          label="Italic"
          icon={Italic}
          active={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          label="Underline"
          icon={UnderlineIcon}
          active={active.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          label="Strikethrough"
          icon={Strikethrough}
          active={active.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolButton
          label="Bulleted list"
          icon={List}
          active={active.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          label="Numbered list"
          icon={ListOrdered}
          active={active.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          label="Link"
          icon={Link2}
          active={active.link}
          onClick={() => {
            setUrl(active.linkHref)
            setLinkOpen((o) => !o)
          }}
        />
        <ToolButton
          label="Code"
          icon={Code}
          active={active.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
      </div>
      {linkOpen && (
        <form
          className="flex gap-2 px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <label className="sr-only" htmlFor="note-link-url">
            Link address
          </label>
          <input
            id="note-link-url"
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-surface-3 px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            {url.trim() ? 'Apply' : 'Remove link'}
          </button>
        </form>
      )}
    </div>
  )
}

export function NotesEditor({ initialHtml, onChange, onLoaded, editorRef }: NotesEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Only what the server will keep (it strips everything else).
        link: { openOnClick: false, protocols: ['mailto'], defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder: 'Write your notes here…' }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        'aria-label': 'Note',
        'aria-multiline': 'true',
        class: 'note-content min-h-48 p-4 focus:outline-none',
      },
    },
    onCreate: ({ editor: e }) => {
      if (editorRef) editorRef.current = e
      onLoaded(normalizeHtml(e), e)
    },
    onUpdate: ({ editor: e }) => onChange(normalizeHtml(e)),
  })

  if (!editor) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface-1">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  )
}
