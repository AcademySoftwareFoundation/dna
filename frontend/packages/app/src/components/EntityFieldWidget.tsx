import { useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { Badge, Checkbox, Select } from '@radix-ui/themes';
import {
  coerceFieldInput,
  entityValueLabels,
  formatFieldValue,
  resolveDataType,
  toDateTimeLocalValue,
} from '@dna/core';
import type { SchemaField } from '@dna/core';
import {
  StyledSelectContent,
  StyledSelectTrigger,
  StyledTextField,
} from './FormInputs';

export interface EntityFieldWidgetProps {
  field: SchemaField;
  value: unknown;
  label: string;
  onCommit: (value: unknown) => void;
}

const NONE_VALUE = '__none__';

const CompactTextField = styled(StyledTextField)`
  &&.rt-TextFieldRoot {
    height: 28px;
    min-width: 160px;
  }

  && input {
    font-size: 13px;
  }
`;

const CompactSelectTrigger = styled(StyledSelectTrigger)`
  &&&.rt-SelectTrigger {
    height: 28px;
    min-width: 160px;
    font-size: 13px;
  }
`;

const ReadOnlyText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const EmptyValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Pills = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const NUMERIC_INPUT_TYPES = new Set([
  'number',
  'float',
  'duration',
  'percent',
  'currency',
]);

function inputTypeFor(
  dataType: string
): 'number' | 'date' | 'datetime-local' | 'text' {
  if (NUMERIC_INPUT_TYPES.has(dataType)) return 'number';
  if (dataType === 'date') return 'date';
  if (dataType === 'date_time') return 'datetime-local';
  return 'text';
}

function toInputValue(dataType: string, value: unknown): string {
  if (dataType === 'date_time') return toDateTimeLocalValue(value);
  if (value === undefined || value === null) return '';
  return String(value);
}

interface TextLikeInputProps {
  field: SchemaField;
  value: unknown;
  label: string;
  onCommit: (value: unknown) => void;
}

function TextLikeInput({ field, value, label, onCommit }: TextLikeInputProps) {
  const stored = toInputValue(field.data_type, value);
  const [draft, setDraft] = useState(stored);

  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const commit = () => {
    if (draft === stored) return;
    const coerced = coerceFieldInput(field.data_type, draft);
    if (coerced === undefined) {
      setDraft(stored);
      return;
    }
    onCommit(coerced);
  };

  return (
    <CompactTextField
      aria-label={label}
      type={inputTypeFor(field.data_type)}
      step={NUMERIC_INPUT_TYPES.has(field.data_type) ? 'any' : undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

interface ChoiceSelectProps {
  field: SchemaField;
  value: unknown;
  label: string;
  onCommit: (value: unknown) => void;
}

function ChoiceSelect({ field, value, label, onCommit }: ChoiceSelectProps) {
  const options = field.acceptable_values ?? [];
  const current = value === undefined || value === null ? '' : String(value);
  const knownCurrent = options.some((option) => option.value === current);

  return (
    <Select.Root
      value={current === '' ? NONE_VALUE : current}
      onValueChange={(next) => onCommit(next === NONE_VALUE ? null : next)}
    >
      <CompactSelectTrigger aria-label={label} />
      <StyledSelectContent>
        <Select.Item value={NONE_VALUE}>None</Select.Item>
        {current !== '' && !knownCurrent && (
          <Select.Item value={current}>{current}</Select.Item>
        )}
        {options.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </StyledSelectContent>
    </Select.Root>
  );
}

function ReadOnlyValue({
  field,
  value,
  label,
}: {
  field: SchemaField;
  value: unknown;
  label: string;
}): ReactNode {
  const dataType = resolveDataType(field.data_type);

  if (dataType === 'entity' || dataType === 'multi_entity') {
    const labels = entityValueLabels(value);
    if (labels.length === 0) {
      return <EmptyValue aria-label={label}>None</EmptyValue>;
    }
    return (
      <Pills aria-label={label}>
        {labels.map((text, index) => (
          <Badge key={`${text}-${index}`} variant="soft">
            {text}
          </Badge>
        ))}
      </Pills>
    );
  }

  let text: string;
  if (dataType === 'checkbox') {
    text = value === true ? 'Yes' : value === false ? 'No' : '';
  } else if (dataType === 'list' || dataType === 'status_list') {
    const current = formatFieldValue(value);
    text =
      field.acceptable_values?.find((option) => option.value === current)
        ?.label ?? current;
  } else {
    text = formatFieldValue(value);
  }

  return text ? (
    <ReadOnlyText aria-label={label}>{text}</ReadOnlyText>
  ) : (
    <EmptyValue aria-label={label}>None</EmptyValue>
  );
}

export function EntityFieldWidget({
  field,
  value,
  label,
  onCommit,
}: EntityFieldWidgetProps) {
  const dataType = resolveDataType(field.data_type);
  const readOnly = <ReadOnlyValue field={field} value={value} label={label} />;

  switch (dataType) {
    case 'text':
    case 'url':
    case 'uuid':
    case 'number':
    case 'float':
    case 'duration':
    case 'percent':
    case 'currency':
    case 'date':
    case 'date_time':
      return field.editable ? (
        <TextLikeInput
          field={field}
          value={value}
          label={label}
          onCommit={onCommit}
        />
      ) : (
        readOnly
      );
    case 'checkbox':
      return field.editable ? (
        <Checkbox
          aria-label={label}
          checked={value === true}
          onCheckedChange={(checked) => onCommit(checked === true)}
        />
      ) : (
        readOnly
      );
    case 'list':
    case 'status_list':
      if (!field.editable) return readOnly;
      return field.acceptable_values?.length ? (
        <ChoiceSelect
          field={field}
          value={value}
          label={label}
          onCommit={onCommit}
        />
      ) : (
        <TextLikeInput
          field={field}
          value={value}
          label={label}
          onCommit={onCommit}
        />
      );
    case 'entity':
    case 'multi_entity':
    case 'unknown':
      return readOnly;
    default: {
      const unreachable: never = dataType;
      return unreachable;
    }
  }
}
