import { useState } from 'react';
import styled from 'styled-components';
import { Checkbox, Popover, TextField } from '@radix-ui/themes';
import { Plus, Search } from 'lucide-react';
import {
  ENTITY_FIELD_LEVELS,
  entityLevelLabel,
  fieldLabel,
  filterSchemaFields,
  isSameSelectedField,
  readFieldValue,
} from '@dna/core';
import type {
  DNAEntity,
  EntityFieldLevel,
  SchemaField,
  Version,
} from '@dna/core';
import { EntityFieldWidget } from './EntityFieldWidget';
import {
  getFieldTargets,
  useEntityFieldValues,
  useEntitySchemas,
  useSelectedEntityFields,
  useUpdateEntityField,
} from '../hooks';
import type { EntityFieldTarget } from '../hooks';

// @radix-ui/themes omits asChild from Popover.Trigger's types even though
// the underlying Radix primitive supports it.
const PopoverTrigger = Popover.Trigger as React.ComponentType<
  React.ComponentPropsWithoutRef<typeof Popover.Trigger> & { asChild?: boolean }
>;

// Fills columns of four rows to the right of the version info, matching the
// four metadata rows so fields line up with them.
const Editor = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(4, 28px);
  grid-column: 2;
  grid-row: 2 / span 4;
  align-items: center;
  justify-content: start;
  gap: 12px 32px;
  min-width: 0;
`;

// Sits in the version info grid, right-aligned on the title row.
const AddButton = styled.button`
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const StyledPopoverContent = styled(Popover.Content)`
  &&.rt-PopoverContent {
    padding: 12px;
    width: 340px;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.default};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }
`;

const SearchField = styled(TextField.Root)`
  &.rt-TextFieldRoot {
    margin-bottom: 8px;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.subtle};
    box-shadow: none;
  }
`;

const FieldList = styled.div`
  max-height: 320px;
  overflow-y: auto;
`;

const GroupHeading = styled.div`
  padding: 8px 4px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const FieldOption = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
  }
`;

const Message = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const RowLabel = styled.span`
  min-width: 140px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

type Schemas = Record<EntityFieldLevel, SchemaField[]>;

interface FieldPickerProps {
  schemas: Schemas;
  entityType?: string;
  selected: ReturnType<typeof useSelectedEntityFields>['selected'];
  isLoading: boolean;
  onToggle: ReturnType<typeof useSelectedEntityFields>['toggle'];
}

function FieldPicker({
  schemas,
  entityType,
  selected,
  isLoading,
  onToggle,
}: FieldPickerProps) {
  const [query, setQuery] = useState('');

  const groups = ENTITY_FIELD_LEVELS.map((level) => {
    const levelLabel = entityLevelLabel(level, entityType);
    return {
      level,
      levelLabel,
      fields: filterSchemaFields(schemas[level], query, levelLabel),
    };
  }).filter((group) => group.fields.length > 0);

  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <AddButton type="button" aria-label="Add fields">
          <Plus size={14} />
          Fields
        </AddButton>
      </PopoverTrigger>
      <StyledPopoverContent side="bottom" align="end" sideOffset={4}>
        <SearchField
          aria-label="Search fields"
          placeholder="Search fields"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        >
          <TextField.Slot>
            <Search size={14} />
          </TextField.Slot>
        </SearchField>
        <FieldList>
          {groups.map(({ level, levelLabel, fields }) => (
            <div key={level} role="group" aria-label={levelLabel}>
              <GroupHeading>{levelLabel}</GroupHeading>
              {fields.map((field) => {
                const target = { level, code: field.code };
                const label = fieldLabel(levelLabel, field);
                return (
                  <FieldOption key={field.code}>
                    <Checkbox
                      aria-label={label}
                      checked={selected.some((item) =>
                        isSameSelectedField(item, target)
                      )}
                      onCheckedChange={() => onToggle(target)}
                    />
                    <span>{label}</span>
                  </FieldOption>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <Message>
              {isLoading ? 'Loading fields...' : 'No matching fields'}
            </Message>
          )}
        </FieldList>
      </StyledPopoverContent>
    </Popover.Root>
  );
}

interface FieldRowProps {
  field: SchemaField;
  label: string;
  entity?: DNAEntity;
  target: EntityFieldTarget;
  playlistId?: string | null;
}

function FieldRow({ field, label, entity, target, playlistId }: FieldRowProps) {
  const updateField = useUpdateEntityField({ playlistId });
  // Remounting the widget after a failed save discards the rejected input.
  const [failedSaves, setFailedSaves] = useState(0);

  return (
    <Row>
      <RowLabel>{label}</RowLabel>
      {entity ? (
        <EntityFieldWidget
          key={failedSaves}
          field={field}
          value={readFieldValue(entity, field)}
          label={label}
          onCommit={(value) =>
            updateField(
              { ...target, field, value },
              { onError: () => setFailedSaves((count) => count + 1) }
            )
          }
        />
      ) : (
        <Message>Loading...</Message>
      )}
    </Row>
  );
}

export interface VersionFieldEditorProps {
  version: Version;
  playlistId?: string | null;
}

export function VersionFieldEditor({
  version,
  playlistId,
}: VersionFieldEditorProps) {
  const entityType = version.entity?.type;
  const { selected, toggle } = useSelectedEntityFields();
  const { schemas, isLoading } = useEntitySchemas({
    projectId: version.project?.id,
    entityType,
    hasTask: !!version.task,
  });
  const { entities } = useEntityFieldValues({ version, selected, schemas });
  const targets = getFieldTargets(version);

  const rows = ENTITY_FIELD_LEVELS.flatMap((level) => {
    const target = targets[level];
    if (!target) return [];
    const levelLabel = entityLevelLabel(level, entityType);
    return selected
      .filter((item) => item.level === level)
      .flatMap((item) => {
        const field = schemas[level].find((entry) => entry.code === item.code);
        return field
          ? [{ level, field, target, label: fieldLabel(levelLabel, field) }]
          : [];
      });
  });

  return (
    <>
      <Editor>
        {rows.map(({ level, field, target, label }) => (
          <FieldRow
            key={`${level}-${field.code}`}
            field={field}
            label={label}
            entity={entities[level]}
            target={target}
            playlistId={playlistId}
          />
        ))}
      </Editor>
      <FieldPicker
        schemas={schemas}
        entityType={entityType}
        selected={selected}
        isLoading={isLoading}
        onToggle={toggle}
      />
    </>
  );
}
