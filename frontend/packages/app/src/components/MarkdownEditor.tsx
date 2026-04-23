import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
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
  Image,
} from 'lucide-react';
import { SearchResult, filterMentionCandidates } from '@dna/core';
import { apiHandler } from '../api';
import {
  useMentionIndex,
  type MentionIndexContextValue,
} from '../contexts/MentionIndexContext';
import { MentionList, type MentionListHandle } from './MentionList';

interface MarkdownEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onAttach?: (file: File) => void;
  attachmentCount?: number;
  attachmentFlashKey?: number;
  animatePill?: boolean;
  onToggleAttachmentTray?: () => void;
  placeholder?: string;
  minHeight?: number;
  projectId?: number | null;
  onMentionInsert?: (entity: SearchResult) => void;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Serialize mention nodes to @[Label](type:id) syntax
turndownService.addRule('mention', {
  filter: (node) =>
    node.nodeName === 'SPAN' &&
    (node as Element).getAttribute('data-type') === 'mention',
  replacement: (_content, node) => {
    const id = (node as Element).getAttribute('data-id') ?? '';
    const label = (node as Element).getAttribute('data-label') ?? _content;
    return `@[${label}](${id})`;
  },
});

const MENTION_REGEX = /@\[([^\]]+)\]\((\w+:\d+)\)/g;

function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // Replace mention syntax before other processing
  let html = markdown.replace(
    MENTION_REGEX,
    '<span data-type="mention" data-id="$2" data-label="$1">@$1</span>'
  );

  html = html
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/~~(.*?)~~/gim, '<s>$1</s>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/^---$/gim, '<hr>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    const ulMatch = line.match(/^[-*] (.*)$/);
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
  height: 100%;
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

const AttachmentPill = styled.button<{ $animated: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: 999px;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  white-space: nowrap;
  transition: all ${({ theme }) => theme.transitions.fast};

  /* Plays once on mount — NoteEditor remounts this via key on each new attachment */
  @keyframes pillGlow {
    0% {
      background: ${({ theme }) => theme.colors.accent.subtle};
      border-color: ${({ theme }) => theme.colors.accent.main};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accent.subtle};
      color: ${({ theme }) => theme.colors.accent.main};
    }
    100% {
      background: ${({ theme }) => theme.colors.bg.surface};
      border-color: ${({ theme }) => theme.colors.border.default};
      box-shadow: none;
      color: ${({ theme }) => theme.colors.text.secondary};
    }
  }
  animation: ${({ $animated }) =>
    $animated ? 'pillGlow 1.1s ease-out' : 'none'};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.strong};
    color: ${({ theme }) => theme.colors.text.primary};
  }
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

    p {
      margin: 0;
    }

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

    /* Mention chip styles */
    span[data-type='mention'] {
      display: inline-flex;
      align-items: center;
      background: ${({ theme }) => theme.colors.accent.subtle};
      color: ${({ theme }) => theme.colors.accent.main};
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 0.9em;
      font-weight: 500;
      white-space: nowrap;
      cursor: default;
      user-select: none;
    }
  }
`;

const MentionDropdownWrapper = styled.div`
  position: fixed;
  z-index: 9999;
`;

interface MentionSuggestionState {
  active: boolean;
  items: SearchResult[];
  rect: DOMRect | null;
  command: ((attrs: { id: string; label: string }) => void) | null;
  /** Prefetch still warming; avoid empty-state flash. */
  isLoading: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  onAttach,
  attachmentCount = 0,
  attachmentFlashKey = 0,
  animatePill = false,
  onToggleAttachmentTray,
  placeholder = 'Write your notes here...',
  minHeight = 80,
  projectId,
  onMentionInsert,
}: MarkdownEditorProps) {
  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onAttach?.(file);
        e.target.value = '';
      }
    },
    [onAttach]
  );

  const projectIdRef = useRef(projectId);
  const onMentionInsertRef = useRef(onMentionInsert);
  const mentionListRef = useRef<MentionListHandle | null>(null);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionCtx = useMentionIndex();
  const mentionIndexRef = useRef<MentionIndexContextValue | null>(null);
  mentionIndexRef.current = mentionCtx;
  const mentionActiveQueryRef = useRef('');

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    onMentionInsertRef.current = onMentionInsert;
  }, [onMentionInsert]);

  const [mention, setMention] = useState<MentionSuggestionState>({
    active: false,
    items: [],
    rect: null,
    command: null,
    isLoading: false,
  });

  function mentionListLoading(
    query: string,
    ctx: MentionIndexContextValue | null
  ): boolean {
    const pid = projectIdRef.current ?? null;
    const useCache = ctx != null && pid != null && ctx.projectId === pid;
    return useCache && query.length > 0 && ctx.isIndexLoading;
  }

  useEffect(() => {
    const ctx = mentionIndexRef.current;
    if (!ctx || ctx.isIndexLoading) return;
    const q = mentionActiveQueryRef.current;
    if (!mention.active || !q) return;
    const pid = projectIdRef.current ?? null;
    if (pid == null || ctx.projectId !== pid) {
      return;
    }
    setMention((prev) => {
      if (!prev.active) return prev;
      return {
        ...prev,
        items: filterMentionCandidates(ctx.mergedCandidates, q, 10),
        isLoading: false,
      };
    });
  }, [mentionCtx, mention.active]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
        renderHTML: ({ node }) => [
          'span',
          {
            'data-type': 'mention',
            'data-id': node.attrs.id,
            'data-label': node.attrs.label,
            class: 'mention',
          },
          `@${node.attrs.label ?? node.attrs.id}`,
        ],
        suggestion: {
          allowSpaces: false,
          items: ({ query }): Promise<SearchResult[]> => {
            if (!query) return Promise.resolve([]);
            const ctx = mentionIndexRef.current;
            const pid = projectIdRef.current ?? null;
            const useCache =
              ctx != null && pid != null && ctx.projectId === pid;
            if (useCache) {
              if (ctx.isIndexLoading) return Promise.resolve([]);
              return Promise.resolve(
                filterMentionCandidates(ctx.mergedCandidates, query, 10)
              );
            }
            return new Promise((resolve) => {
              if (mentionDebounceRef.current)
                clearTimeout(mentionDebounceRef.current);
              mentionDebounceRef.current = setTimeout(async () => {
                try {
                  const results = await apiHandler.searchEntities({
                    query,
                    entityTypes: ['user', 'shot', 'asset', 'version', 'task'],
                    projectId: projectIdRef.current ?? undefined,
                    limit: 10,
                  });
                  resolve(results);
                } catch {
                  resolve([]);
                }
              }, 300);
            });
          },
          render: () => ({
            onStart: (props) => {
              const q = props.query;
              mentionActiveQueryRef.current = q;
              setMention({
                active: true,
                items: props.items as SearchResult[],
                rect: props.clientRect?.() ?? null,
                command: props.command as (attrs: {
                  id: string;
                  label: string;
                }) => void,
                isLoading: mentionListLoading(q, mentionIndexRef.current),
              });
            },
            onUpdate: (props) => {
              const q = props.query;
              mentionActiveQueryRef.current = q;
              setMention((prev) => ({
                ...prev,
                items: props.items as SearchResult[],
                rect: props.clientRect?.() ?? null,
                command: props.command as (attrs: {
                  id: string;
                  label: string;
                }) => void,
                isLoading: mentionListLoading(q, mentionIndexRef.current),
              }));
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                setMention((prev) => ({ ...prev, active: false }));
                return true;
              }
              return mentionListRef.current?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              mentionActiveQueryRef.current = '';
              setMention({
                active: false,
                items: [],
                rect: null,
                command: null,
                isLoading: false,
              });
            },
          }),
        },
      }),
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

  function handleMentionCommand(attrs: { id: string; label: string }) {
    if (!mention.command) return;
    mention.command(attrs);

    // Parse type and id from "type:id" format and sync to properties panel
    const [type, idStr] = attrs.id.split(':');
    if (type && idStr) {
      const entity: SearchResult = {
        type: type.charAt(0).toUpperCase() + type.slice(1),
        id: parseInt(idStr, 10),
        name: attrs.label,
      };
      onMentionInsertRef.current?.(entity);
    }
  }

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
        <Divider />
        <ToolbarButton title="Attach Image" onClick={handleAttachClick}>
          <Image />
        </ToolbarButton>
        {attachmentCount > 0 && (
          <AttachmentPill
            key={attachmentFlashKey}
            $animated={animatePill}
            onClick={onToggleAttachmentTray}
            title="View attached images"
          >
            {attachmentCount} {attachmentCount === 1 ? 'Image' : 'Images'}
          </AttachmentPill>
        )}
      </Toolbar>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {mention.active &&
        mention.rect &&
        mention.command &&
        createPortal(
          <MentionDropdownWrapper
            style={{
              top: mention.rect.bottom + 4,
              left: mention.rect.left,
            }}
          >
            <MentionList
              ref={mentionListRef}
              items={mention.items}
              command={handleMentionCommand}
              loading={mention.isLoading}
            />
          </MentionDropdownWrapper>,
          document.body
        )}
    </EditorWrapper>
  );
}
