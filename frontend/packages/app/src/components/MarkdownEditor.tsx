import { useState } from 'react';
import styled from 'styled-components';
import MDEditor, { commands } from '@uiw/react-md-editor';

interface MarkdownEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const EditorWrapper = styled.div<{ $minHeight: number }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: ${({ $minHeight }) => $minHeight}px;

  .w-md-editor {
    background: ${({ theme }) => theme.colors.bg.base};
    border: 1px solid ${({ theme }) => theme.colors.border.default};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: none;
    font-family: ${({ theme }) => theme.fonts.sans};
    flex: 1;
    display: flex;
    flex-direction: column;
    height: auto !important;
    min-height: ${({ $minHeight }) => $minHeight}px;

    &:focus-within {
      border-color: ${({ theme }) => theme.colors.accent.main};
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
    }
  }

  .w-md-editor-toolbar {
    background: ${({ theme }) => theme.colors.bg.overlay};
    border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
    border-bottom: none;
    padding: 4px 6px;
    min-height: auto;
  }

  .w-md-editor-toolbar li > button {
    color: ${({ theme }) => theme.colors.text.secondary};
    height: 22px;
    width: 22px;
    padding: 2px;
    margin: 0;
    border-radius: ${({ theme }) => theme.radii.sm};

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover {
      background: ${({ theme }) => theme.colors.bg.surfaceHover};
      color: ${({ theme }) => theme.colors.text.primary};
    }

    &:disabled {
      color: ${({ theme }) => theme.colors.text.muted};
    }
  }

  .w-md-editor-toolbar li.active > button {
    background: ${({ theme }) => theme.colors.accent.subtle};
    color: ${({ theme }) => theme.colors.accent.main};
  }

  .w-md-editor-toolbar-divider {
    background: ${({ theme }) => theme.colors.border.subtle};
    height: 12px;
    margin: 0 4px;
  }

  .w-md-editor-content {
    background: ${({ theme }) => theme.colors.bg.base};
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .w-md-editor-text-input,
  .w-md-editor-text-pre > code,
  .w-md-editor-text {
    font-size: 14px;
    line-height: 1.6;
    font-family: ${({ theme }) => theme.fonts.sans};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  .w-md-editor-text-pre > code {
    font-family: ${({ theme }) => theme.fonts.mono};
  }

  .w-md-editor-preview {
    background: ${({ theme }) => theme.colors.bg.base};
    padding: 12px;
    font-size: 14px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.text.primary};

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: ${({ theme }) => theme.colors.text.primary};
      margin-top: 16px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    p {
      margin-bottom: 12px;
    }

    a {
      color: ${({ theme }) => theme.colors.accent.main};
    }

    code {
      background: ${({ theme }) => theme.colors.bg.overlay};
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ${({ theme }) => theme.fonts.mono};
      font-size: 13px;
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
      border-left: 3px solid ${({ theme }) => theme.colors.accent.main};
      margin: 12px 0;
      padding-left: 12px;
      color: ${({ theme }) => theme.colors.text.secondary};
    }

    ul,
    ol {
      padding-left: 24px;
      margin-bottom: 12px;
    }

    li {
      margin-bottom: 4px;
    }

    hr {
      border: none;
      border-top: 1px solid ${({ theme }) => theme.colors.border.default};
      margin: 16px 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 12px;
    }

    th,
    td {
      border: 1px solid ${({ theme }) => theme.colors.border.default};
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background: ${({ theme }) => theme.colors.bg.overlay};
      font-weight: 600;
    }
  }

  .w-md-editor-area {
    padding: 12px;
    flex: 1;
  }

  .w-md-editor-input {
    color: ${({ theme }) => theme.colors.text.primary};
  }

  .wmde-markdown-color {
    background: transparent;
  }

  textarea::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

export function MarkdownEditor({
  value: controlledValue,
  onChange,
  placeholder = 'Write your notes here... (supports **markdown**)',
  minHeight = 80,
}: MarkdownEditorProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? '');
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (val?: string) => {
    const newValue = val ?? '';
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  const toolbarCommands = [
    commands.bold,
    commands.italic,
    commands.strikethrough,
    commands.divider,
    commands.title,
    commands.divider,
    commands.link,
    commands.quote,
    commands.code,
    commands.codeBlock,
    commands.divider,
    commands.unorderedListCommand,
    commands.orderedListCommand,
    commands.checkedListCommand,
  ];

  return (
    <EditorWrapper data-color-mode="dark" $minHeight={minHeight}>
      <MDEditor
        value={value}
        onChange={handleChange}
        preview="edit"
        height={minHeight}
        visibleDragbar={false}
        toolbarBottom
        commands={toolbarCommands}
        extraCommands={[]}
        textareaProps={{
          placeholder,
        }}
      />
    </EditorWrapper>
  );
}
