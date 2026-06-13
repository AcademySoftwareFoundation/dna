export interface TranscriptSegment {
  segment_id: string;
  text: string;
  speaker?: string;
  language?: string;
  start_time?: number;
  end_time?: number;
  absolute_start_time: string;
  absolute_end_time: string;
  updated_at?: string;
}

export interface TranscriptFrame {
  type: 'transcript';
  speaker?: string;
  confirmed: TranscriptSegment[];
  pending: TranscriptSegment[];
  ts: string;
}

export interface SttSegmentInput {
  text: string;
  start: number;
  end: number;
  language?: string;
}

export interface SegmentBuilderOptions {
  sessionUid: string;
  sessionStart: Date;
}

function toIso(date: Date): string {
  return date.toISOString();
}

function speakerSlot(speaker: string): string {
  const normalized = speaker.trim() || 'Unknown';
  return normalized.replace(/\s+/g, '_');
}

export class SegmentBuilder {
  private sequenceBySpeaker = new Map<string, number>();

  constructor(private readonly options: SegmentBuilderOptions) {}

  private nextSegmentId(speaker: string): string {
    const slot = speakerSlot(speaker);
    const next = (this.sequenceBySpeaker.get(slot) ?? 0) + 1;
    this.sequenceBySpeaker.set(slot, next);
    return `${this.options.sessionUid}:${slot}:${next}`;
  }

  private absoluteTime(offsetSeconds: number): string {
    const ms =
      this.options.sessionStart.getTime() + Math.round(offsetSeconds * 1000);
    return toIso(new Date(ms));
  }

  private buildSegment(
    input: SttSegmentInput,
    speaker: string,
    segmentId: string,
  ): TranscriptSegment {
    const now = toIso(new Date());
    return {
      segment_id: segmentId,
      text: input.text.trim(),
      speaker,
      language: input.language,
      start_time: input.start,
      end_time: input.end,
      absolute_start_time: this.absoluteTime(input.start),
      absolute_end_time: this.absoluteTime(input.end),
      updated_at: now,
    };
  }

  buildConfirmed(input: SttSegmentInput, speaker: string): TranscriptFrame {
    const segmentId = this.nextSegmentId(speaker);
    const segment = this.buildSegment(input, speaker, segmentId);
    return {
      type: 'transcript',
      speaker,
      confirmed: [segment],
      pending: [],
      ts: toIso(new Date()),
    };
  }

  buildPending(text: string, speaker: string): TranscriptFrame {
    const segmentId = `${this.options.sessionUid}:${speakerSlot(speaker)}:pending`;
    const now = toIso(new Date());
    return {
      type: 'transcript',
      speaker,
      confirmed: [],
      pending: [
        {
          segment_id: segmentId,
          text: text.trim(),
          speaker,
          absolute_start_time: now,
          absolute_end_time: now,
          updated_at: now,
        },
      ],
      ts: now,
    };
  }
}
