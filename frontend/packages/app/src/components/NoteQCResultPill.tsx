import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button, Flex, Popover, Text, Tooltip } from '@radix-ui/themes';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';
import {
  fixAllDisabledReason,
  mergeQCResultPatches,
} from '../qc/noteQcPatch';

type PillTone = 'ok' | 'warn' | 'err' | 'loading' | 'ignored';

const PillButton = styled.button<{ $tone: PillTone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'ok'
        ? 'var(--green-9)'
        : $tone === 'warn'
          ? 'var(--amber-9)'
          : $tone === 'err'
            ? 'var(--red-9)'
            : $tone === 'ignored'
              ? 'var(--purple-9)'
              : 'var(--gray-7)'};
  background: var(--color-panel);
  color: ${({ $tone }) =>
    $tone === 'ok'
      ? 'var(--green-11)'
      : $tone === 'warn'
        ? 'var(--amber-11)'
        : $tone === 'err'
          ? 'var(--red-11)'
          : $tone === 'ignored'
            ? 'var(--purple-11)'
            : 'var(--gray-11)'};
`;

const Details = styled.details`
  margin-top: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  border-radius: var(--radius-2);
  summary {
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    margin: 0;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.text.secondary};
    list-style: none;
    &::-webkit-details-marker {
      display: none;
    }
  }
  summary .qc-details-chevron {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.text.muted};
    transition: transform 0.15s ease;
  }
  &[open] summary .qc-details-chevron {
    transform: rotate(90deg);
  }
  &[open] {
    border: 1px solid ${({ theme }) => theme.colors.border.default};
    padding: 8px 10px;
    margin-top: 6px;
  }
  &[open] summary {
    padding: 0 0 6px;
    margin: 0 0 4px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  }
`;

const Spin = styled(Loader2)`
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

function ignoreKey(draftKey: string, checkId: string): string {
  return `${draftKey}:${checkId}`;
}

export interface NoteQCResultPillProps {
  draftKey: string;
  results: NoteQCResult[];
  loading: boolean;
  ignored: Set<string>;
  onToggleIgnore: (checkId: string) => void;
  onFix: (result: NoteQCResult) => void;
  localDraft: LocalDraftNote;
  onFixAll: (patch: Partial<LocalDraftNote>) => void;
}

export const NoteQCResultPill: React.FC<NoteQCResultPillProps> = ({
  draftKey,
  results,
  loading,
  ignored,
  onToggleIgnore,
  onFix,
  localDraft,
  onFixAll,
}) => {
  const failedResults = useMemo(
    () => results.filter((r) => !r.passed),
    [results]
  );

  const activeFailures = useMemo(
    () => failedResults.filter((r) => !ignored.has(ignoreKey(draftKey, r.check_id))),
    [failedResults, ignored, draftKey]
  );

  const fixAllBlockReason = useMemo(
    () => fixAllDisabledReason(activeFailures),
    [activeFailures]
  );

  const fixAllEnabled = activeFailures.length >= 2 && fixAllBlockReason === null;

  const { label, tone } = useMemo(() => {
    if (loading) return { label: 'Note QC: Running…', tone: 'loading' as const };
    if (results.length === 0) return { label: 'Note QC: —', tone: 'loading' as const };
    if (failedResults.length === 0) {
      return { label: 'Note QC: All checks pass', tone: 'ok' as const };
    }
    const unresolvedErr = failedResults.find(
      (r) => r.severity === 'error' && !ignored.has(ignoreKey(draftKey, r.check_id))
    );
    if (unresolvedErr) {
      return {
        label: `Note QC: ${unresolvedErr.issue ?? 'Error'}`,
        tone: 'err' as const,
      };
    }
    const unresolvedWarn = failedResults.find(
      (r) => r.severity === 'warning' && !ignored.has(ignoreKey(draftKey, r.check_id))
    );
    if (unresolvedWarn) {
      return {
        label: `Note QC: ${unresolvedWarn.issue ?? 'Warning'}`,
        tone: 'warn' as const,
      };
    }
    const firstFailed = failedResults[0];
    return {
      label: `Note QC: ${firstFailed?.issue ?? 'Ignored'}`,
      tone: 'ignored' as const,
    };
  }, [loading, results, failedResults, ignored, draftKey]);

  const [open, setOpen] = useState(false);

  if (!loading && results.length === 0) {
    return null;
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <PillButton type="button" $tone={tone} aria-label="Note QC status">
          {loading ? <Spin size={12} /> : null}
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          {!loading ? <ChevronDown size={14} /> : null}
        </PillButton>
      </Popover.Trigger>
      <Popover.Content width="360px" side="bottom" align="end" style={{ padding: '12px 14px' }}>
        <Flex direction="column" gap="2">
          <Flex align="center" justify="between" gap="2" wrap="wrap" mb="1">
            <Text size="2" weight="bold">
              Note QC
            </Text>
            {!loading && activeFailures.length >= 2 ? (
              <Tooltip
                content={
                  fixAllEnabled
                    ? 'Apply every non-ignored suggestion when each check targets a different field.'
                    : (fixAllBlockReason ?? '')
                }
              >
                <span style={{ display: 'inline-block' }}>
                  <Button
                    type="button"
                    variant="soft"
                    size="1"
                    disabled={loading || !fixAllEnabled}
                    onClick={() => {
                      if (!fixAllEnabled) return;
                      setOpen(false);
                      onFixAll(mergeQCResultPatches(localDraft, activeFailures));
                    }}
                  >
                    Fix all
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </Flex>
          {loading ? (
            <Text size="2" color="gray">
              Running checks…
            </Text>
          ) : failedResults.length === 0 ? (
            <Text size="2" color="gray">
              All checks pass for this note.
            </Text>
          ) : (
            failedResults.map((r) => {
              const isIgnored = ignored.has(ignoreKey(draftKey, r.check_id));
              return (
                <Flex key={r.check_id} direction="column" gap="1">
                  <Flex align="center" gap="2" wrap="wrap">
                    <Text size="2" weight="medium">
                      {r.check_name}
                    </Text>
                    {isIgnored ? (
                      <Text size="1" color="purple" style={{ fontWeight: 600 }}>
                        Ignored
                      </Text>
                    ) : null}
                  </Flex>
                  {r.issue ? (
                    <Text size="2" color="gray" style={{ lineHeight: 1.35 }}>
                      {r.issue}
                    </Text>
                  ) : null}
                  <Details>
                    <summary>
                      <ChevronRight className="qc-details-chevron" size={14} aria-hidden />
                      Extra details
                    </summary>
                    {r.evidence ? (
                      <Text as="p" size="1" style={{ marginTop: 6, lineHeight: 1.4 }}>
                        {r.evidence}
                      </Text>
                    ) : null}
                    {r.note_suggestion ? (
                      <Text as="p" size="1" style={{ marginTop: 6, lineHeight: 1.4 }}>
                        <strong>Suggested note:</strong> {r.note_suggestion.slice(0, 400)}
                        {r.note_suggestion.length > 400 ? '…' : ''}
                      </Text>
                    ) : null}
                  </Details>
                  <Flex gap="2" justify="end" align="center" mt="2" wrap="wrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="1"
                      onClick={() => onToggleIgnore(r.check_id)}
                    >
                      {isIgnored ? 'Restore' : 'Ignore'}
                    </Button>
                    <Button
                      type="button"
                      size="1"
                      onClick={() => {
                        setOpen(false);
                        onFix(r);
                      }}
                    >
                      Fix
                    </Button>
                  </Flex>
                </Flex>
              );
            })
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
