import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Dialog,
  Flex,
  Switch,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NoteQCCheck,
  NoteQCCheckCreate,
  NoteQCCheckUpdate,
  NoteQCSeverity,
} from '@dna/core';
import { apiHandler } from '../api';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

interface NoteQCTabProps {
  userEmail: string;
}

export const NoteQCTab: React.FC<NoteQCTabProps> = ({ userEmail }) => {
  const qc = useQuery({
    queryKey: ['qcChecks', userEmail],
    queryFn: () => apiHandler.getQCChecks({ userEmail }),
  });
  const qcClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<NoteQCCheck | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [severity, setSeverity] = useState<NoteQCSeverity>('warning');

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPrompt('');
    setSeverity('warning');
    setEditorOpen(true);
  };

  const openEdit = (c: NoteQCCheck) => {
    setEditing(c);
    setName(c.name);
    setPrompt(c.prompt);
    setSeverity(c.severity);
    setEditorOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (data: NoteQCCheckCreate) =>
      apiHandler.createQCCheck({ userEmail, data }),
    onSuccess: () => {
      void qcClient.invalidateQueries({ queryKey: ['qcChecks', userEmail] });
      setEditorOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: NoteQCCheckUpdate }) =>
      apiHandler.updateQCCheck({ userEmail, checkId: id, data }),
    onSuccess: () => {
      void qcClient.invalidateQueries({ queryKey: ['qcChecks', userEmail] });
      setEditorOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiHandler.deleteQCCheck({ userEmail, checkId: id }),
    onSuccess: () => void qcClient.invalidateQueries({ queryKey: ['qcChecks', userEmail] }),
  });

  const handleSave = useCallback(() => {
    if (!name.trim() || !prompt.trim()) return;
    if (editing) {
      updateMut.mutate({
        id: editing._id,
        data: { name: name.trim(), prompt: prompt.trim(), severity },
      });
    } else {
      createMut.mutate({
        name: name.trim(),
        prompt: prompt.trim(),
        severity,
        enabled: true,
      });
    }
  }, [name, prompt, severity, editing, createMut, updateMut]);

  const toggleEnabled = (c: NoteQCCheck, enabled: boolean) => {
    updateMut.mutate({ id: c._id, data: { enabled } });
  };

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Define LLM checks that run when you open Publish. Error-level failures block publishing
        until you fix or ignore them.
      </Text>
      <Flex justify="end">
        <Button type="button" size="2" onClick={openCreate}>
          <Plus size={16} style={{ marginRight: 6 }} />
          Add check
        </Button>
      </Flex>
      {qc.isLoading ? (
        <Text size="2" color="gray">
          Loading…
        </Text>
      ) : qc.isError ? (
        <Text size="2" color="red">
          Failed to load checks.
        </Text>
      ) : (
        <div>
          {(qc.data ?? []).map((c) => (
            <Row key={c._id}>
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => toggleEnabled(c, v === true)}
              />
              <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
                <Text weight="medium" size="2" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </Text>
                <Text size="1" color="gray">
                  {c.severity === 'error' ? 'Error (blocks publish)' : 'Warning'}
                </Text>
              </Flex>
              <Button type="button" variant="ghost" size="1" onClick={() => openEdit(c)}>
                <Pencil size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="red"
                size="1"
                onClick={() => {
                  if (window.confirm(`Delete check "${c.name}"?`)) {
                    deleteMut.mutate(c._id);
                  }
                }}
              >
                <Trash2 size={16} />
              </Button>
            </Row>
          ))}
        </div>
      )}

      <Dialog.Root open={editorOpen} onOpenChange={setEditorOpen}>
        <Dialog.Content maxWidth="480px">
          <Dialog.Title>{editing ? 'Edit check' : 'New check'}</Dialog.Title>
          <Flex direction="column" gap="3" mt="2">
            <label>
              <Text size="1" weight="medium" as="div" mb="1">
                Name
              </Text>
              <TextField.Root value={name} onChange={(e) => setName(e.target.value)} placeholder="Short name" />
            </label>
            <label>
              <Text size="1" weight="medium" as="div" mb="1">
                Instructions
              </Text>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what the LLM should verify…"
                rows={6}
              />
            </label>
            <Flex align="center" gap="3">
              <Text size="2">Severity</Text>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="sev"
                  checked={severity === 'warning'}
                  onChange={() => setSeverity('warning')}
                />
                Warning
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="sev"
                  checked={severity === 'error'}
                  onChange={() => setSeverity('error')}
                />
                Error
              </label>
            </Flex>
            <Flex justify="end" gap="2" mt="2">
              <Dialog.Close>
                <Button variant="soft" color="gray" type="button">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                onClick={() => handleSave()}
                disabled={createMut.isPending || updateMut.isPending}
              >
                Save
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
};
