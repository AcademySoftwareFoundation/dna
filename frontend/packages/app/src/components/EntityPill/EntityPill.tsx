import * as React from 'react';
import { Badge, Tooltip } from '@radix-ui/themes';
import type { BadgeProps } from '@radix-ui/themes';
import {
    PersonIcon,
    VideoIcon,
    CubeIcon,
    LayersIcon,
    CheckCircledIcon,
    Cross2Icon,
    FileIcon,
    ArchiveIcon
} from '@radix-ui/react-icons';
import { styled } from 'styled-components';

export type EntityType =
    | "user"
    | "shot"
    | "asset"
    | "version"
    | "task"
    | "playlist"
    | "project";


export interface EntityPillEntity {
    type: EntityType;
    id: number;
    name: string;
}

export interface EntityPillProps {
    entity: EntityPillEntity;
    onRemove?: () => void;
    size?: 'default' | 'compact';
    className?: string;
}

const Label = styled.span<{ $compact: boolean }>`
  min-width: 0;
  max-width: ${({ $compact }) => ($compact ? '140px' : '200px')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;


const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 0;

  color: rgba(255,255,255,0.6);
  &:hover { color: #fff; }

  &:focus-visible { outline: 2px solid rgba(255,255,255,0.35); outline-offset:2px; border-radius:6px; }
`;

const PillRoot = styled(Badge)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
`;

const ENTITY_ICONS: Record<EntityType, React.ElementType> = {
    user: PersonIcon,
    shot: VideoIcon,
    asset: CubeIcon,
    version: LayersIcon,
    task: CheckCircledIcon,
    playlist: FileIcon,
    project: ArchiveIcon,
};



const ENTITY_COLORS: Record<EntityType, BadgeProps['color']> = {
    user: 'blue',
    shot: 'purple',
    asset: 'green',
    version: 'orange',
    task: 'gray',
    playlist: "cyan",
    project: "indigo",
};

export function EntityPill({ entity, onRemove, size = 'default', className }: EntityPillProps) {
    const Icon = ENTITY_ICONS[entity.type];
    const color = ENTITY_COLORS[entity.type];

    const labelRef = React.useRef<HTMLSpanElement>(null);
    const [truncated, setTruncated] = React.useState(false);

    React.useLayoutEffect(() => {
        const el = labelRef.current;
        if (!el) return;
        const compute = () => setTruncated(el.scrollWidth > el.clientWidth);
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, [entity.name, size]);

    const label = (
        <Label ref={labelRef} $compact={size === 'compact'}>
            {entity.name}
        </Label>
    );

    return (
        <PillRoot color={color} size={size === 'compact' ? '1' : '2'} className={className}>
            <Icon aria-hidden />

            {truncated ? <Tooltip content={entity.name}>{label}</Tooltip> : label}

            {onRemove && (
                <RemoveButton type="button" onClick={onRemove} aria-label={`Remove ${entity.name}`}>
                    <Cross2Icon aria-hidden />
                </RemoveButton>
            )}
        </PillRoot>
    );
}
