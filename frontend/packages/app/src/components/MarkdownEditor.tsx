import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Minus,
} from 'lucide-react';

interface MarkdownEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  let html = markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/~~(.*?)~~/gim, '<s>$1</s>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/^---$/gim, '<hr>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    const ulMatch = line.match(/^[\-\*] (.*)$/);
    const olMatch = line.match(/^\d+\. (.*)$/);

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = '';
      }
      if (line.trim() && !line.startsWith('<')) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push(line);
      }
    }
  }
  if (inList) result.push(`</${listType}>`);

  return result.join('');
}

function htmlToMarkdown(html: string): string {
  if (!html) return '';
  return turndownService.turndown(html);
}

const EditorWrapper = styled.div<{ $minHeight: number }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: ${({ $minHeight }) => $minHeight}px;
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 2px;
  padding: 6px 8px;
  background: ${({ theme }) => theme.colors.bg.overlay};
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
  flex-wrap: wrap;
`;

const ToolbarButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.bg.surfaceHover : 'transparent'};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.text.primary : theme.colors.text.secondary};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  &:disabled {
    color: ${({ theme }) => theme.colors.text.muted};
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Divider = styled.div`
  width: 1px;
  height: 20px;
  background: ${({ theme }) => theme.colors.border.subtle};
  margin: 4px 4px;
`;

const EditorContent_ = styled(EditorContent)`
  flex: 1;
  overflow-y: auto;

  .tiptap {
    padding: 12px;
    min-height: 100%;
    outline: none;
    font-family: ${({ theme }) => theme.fonts.sans};
    font-size: 14px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.text.primary};

    > * + * {
      margin-top: 0.5em;
    }

    p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: ${({ theme }) => theme.colors.text.muted};
      pointer-events: none;
      height: 0;
    }

    h1 {
      font-size: 1.75em;
      font-weight: 700;
      margin-top: 1em;
    }

    h2 {
      font-size: 1.4em;
      font-weight: 600;
      margin-top: 0.8em;
    }

    h3 {
      font-size: 1.15em;
      font-weight: 600;
      margin-top: 0.6em;
    }

    strong {
      font-weight: 600;
    }

    code {
      background: ${({ theme }) => theme.colors.bg.overlay};
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ${({ theme }) => theme.fonts.mono};
      font-size: 0.9em;
    }

    pre {
      background: ${({ theme }) => theme.colors.bg.overlay};
      padding: 12px;
      border-radius: ${({ theme }) => theme.radii.md};
      overflow-x: auto;

      code {
        background: transparent;
        padding: 0;
      }
    }

    blockquote {
      border-left: 3px solid ${({ theme }) => theme.colors.border.strong};
      margin: 0.5em 0;
      padding-left: 12px;
      color: ${({ theme }) => theme.colors.text.secondary};
    }

    ul,
    ol {
      padding-left: 24px;
    }

    li {
      margin-bottom: 4px;
    }

    hr {
      border: none;
      border-top: 1px solid ${({ theme }) => theme.colors.border.default};
      margin: 1em 0;
    }

    a {
      color: ${({ theme }) => theme.colors.text.primary};
      text-decoration: underline;
      cursor: pointer;
    }
  }
`;

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write your notes here...',
  minHeight = 80,
}: MarkdownEditorProps) {
  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ? markdownToHtml(value) : '',
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      lastValueRef.current = markdown;
      onChange?.(markdown);
    },
  });

  useEffect(() => {
    if (!editor || value === lastValueRef.current) return;
    lastValueRef.current = value;
    isUpdatingRef.current = true;
    const html = value ? markdownToHtml(value) : '';
    editor.commands.setContent(html);
    isUpdatingRef.current = false;
  }, [value, editor]);

  if (!editor) return null;

  return (
    <EditorWrapper $minHeight={minHeight}>
      <EditorContent_ editor={editor} />
      <Toolbar>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          $active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          $active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          $active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          $active={editor.isActive('code')}
          title="Inline Code"
        >
          <Code />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          $active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          $active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          $active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          $active={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          $active={editor.isActive('blockquote')}
          title="Quote"
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus />
        </ToolbarButton>
      </Toolbar>
    </EditorWrapper>
  );
}
