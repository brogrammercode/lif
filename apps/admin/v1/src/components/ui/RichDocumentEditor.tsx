import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { fileDataUrl } from "../../modules/partner-program/partner-program.api";
import { InlineError } from "../feedback/StateCard";
import "../../styles/partner-program.css";

const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => ({ width: attributes.width }),
      },
    };
  },
});

export function RichDocumentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  async function addImage(editor: Editor, file: File) {
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 2_000_000
      )
        throw new Error("Choose a JPEG, PNG or WebP image up to 2 MB.");
      const src = await fileDataUrl(file);
      editor.chain().focus().setImage({ src, alt: file.name }).run();
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the image.",
      );
    }
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      DocumentImage.configure({ allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing your document…" }),
    ],
    content: value,
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: {
        class: "rich-document",
        role: "textbox",
        "aria-label": "Document content",
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
          item.type.startsWith("image/"),
        );
        if (file && editor) {
          void addImage(editor, file);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith("image/"),
        );
        if (file && editor) {
          event.preventDefault();
          void addImage(editor, file);
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML())
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  if (!editor) return null;
  const tool = (label: string, action: () => unknown, active = false) => (
    <button
      type="button"
      aria-pressed={active}
      className={`editor-tool${active ? " is-active" : ""}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => action()}
    >
      {label}
    </button>
  );
  return (
    <div className="document-editor">
      {error && <InlineError message={error} />}
      <div className="document-toolbar" aria-label="Document formatting">
        <select
          aria-label="Paragraph style"
          disabled={disabled}
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : "p"
          }
          onChange={(event) =>
            event.target.value === "p"
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .toggleHeading({
                    level: Number(event.target.value) as 1 | 2 | 3,
                  })
                  .run()
          }
        >
          <option value="p">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          aria-label="Font family"
          disabled={disabled}
          onChange={(event) =>
            editor.chain().focus().setFontFamily(event.target.value).run()
          }
          defaultValue="Arial"
        >
          <option>Arial</option>
          <option>Georgia</option>
          <option>Times New Roman</option>
          <option>Courier New</option>
          <option>Verdana</option>
        </select>
        <select
          aria-label="Font size"
          disabled={disabled}
          defaultValue="14"
          onChange={(event) =>
            editor
              .chain()
              .focus()
              .setFontSize(event.target.value + "px")
              .run()
          }
        >
          {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
        {tool(
          "Bold",
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {tool(
          "Italic",
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {tool(
          "Underline",
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive("underline"),
        )}
        {tool(
          "Strike",
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        <label className="editor-color">
          Text
          <input
            type="color"
            aria-label="Text color"
            disabled={disabled}
            onChange={(event) =>
              editor.chain().focus().setColor(event.target.value).run()
            }
          />
        </label>
        <label className="editor-color">
          Highlight
          <input
            type="color"
            aria-label="Background color"
            disabled={disabled}
            defaultValue="#fff1e6"
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .setBackgroundColor(event.target.value)
                .run()
            }
          />
        </label>
        {(["left", "center", "right", "justify"] as const).map((align) =>
          tool(
            align,
            () => editor.chain().focus().setTextAlign(align).run(),
            editor.isActive({ textAlign: align }),
          ),
        )}
        {tool(
          "Bullets",
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {tool(
          "Numbered",
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {tool(
          "Checklist",
          () => editor.chain().focus().toggleTaskList().run(),
          editor.isActive("taskList"),
        )}
        {tool(
          "Quote",
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {tool(
          "Code",
          () => editor.chain().focus().toggleCodeBlock().run(),
          editor.isActive("codeBlock"),
        )}
        {tool("Link", () => {
          const href = window.prompt(
            "Link URL (https://, mailto: or tel:)",
            String(editor.getAttributes("link").href ?? ""),
          );
          if (href === null) return;
          if (!href) editor.chain().focus().unsetLink().run();
          else if (/^(https:\/\/|mailto:|tel:)/i.test(href))
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href })
              .run();
          else setError("Use an HTTPS, email or telephone link.");
        })}
        {tool("Image", () => input.current?.click())}
        {editor.isActive("image") &&
          [25, 50, 75, 100].map((width) =>
            tool(width + "%", () =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", { width: width + "%" })
                .run(),
            ),
          )}
        {tool("Table", () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        )}
        {editor.isActive("table") && (
          <>
            {tool("+ Row", () => editor.chain().focus().addRowAfter().run())}
            {tool("+ Column", () =>
              editor.chain().focus().addColumnAfter().run(),
            )}
            {tool("− Row", () => editor.chain().focus().deleteRow().run())}
            {tool("− Column", () =>
              editor.chain().focus().deleteColumn().run(),
            )}
            {tool("Merge cells", () =>
              editor.chain().focus().mergeCells().run(),
            )}
            {tool("Split cell", () => editor.chain().focus().splitCell().run())}
            {tool("Delete table", () =>
              editor.chain().focus().deleteTable().run(),
            )}
          </>
        )}
        {tool("Rule", () => editor.chain().focus().setHorizontalRule().run())}
        {tool("Clear style", () =>
          editor.chain().focus().unsetAllMarks().clearNodes().run(),
        )}
        {tool("Undo", () => editor.chain().focus().undo().run())}
        {tool("Redo", () => editor.chain().focus().redo().run())}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addImage(editor, file);
          event.target.value = "";
        }}
      />
      <EditorContent editor={editor} />
      <p className="field-hint p-3">
        Paste or drag images into the document. New images are previewed locally
        and uploaded as WebP only when you save. Save regularly; publishing
        makes the saved version available to applicants.
      </p>
    </div>
  );
}
