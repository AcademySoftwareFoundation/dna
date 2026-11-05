import {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import * as I from '../LiveUiDemo/icons';
import uiStyles from '../LiveUiDemo/styles.module.css';
import {TRANSCRIPTS} from './transcripts';
import styles from './styles.module.css';

/** Pause after a word, and the longer one after a sentence ends. */
const WORD_MS = 140;
const SENTENCE_MS = 550;

const endsSentence = (word: string) => /[.!?…]["')]?$/.test(word);

interface Cursor {
  /** Index into TRANSCRIPTS. */
  transcript: number;
  line: number;
  word: number;
}

/** A transcript line as it arrives: the app's segment, with its timestamp. */
interface Segment {
  speaker: string;
  text: string;
  time: string;
  /** Still being spoken: the app shows these italic until they complete. */
  pending: boolean;
}

const timeNow = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

/**
 * The app's Transcript tab, live. Streams one of the eval transcripts word
 * by word to whichever version is in review. When in-review moves, the
 * current sentence finishes first, then the list clears and the next
 * transcript in the cycle streams to the new version; a transcript that runs
 * out just stops until the next switch. Idle while nothing is in review, or
 * while `active` is off (demo off screen, or showing its checkmark).
 *
 * The stream belongs to the in-review version, so it's only shown while
 * that version is the one on screen; on any other version the tab shows no
 * segments, and the stream carries on behind it.
 *
 * With `loop` on, a transcript that runs out starts the next one instead of
 * stopping, so the feed streams for as long as it's active (the homepage).
 */
export function TranscriptFeed({
  targetName,
  shown,
  active,
  resetKey,
  loop = false,
  allTabs = false,
}: {
  /** The in-review version's name, or null for none. */
  targetName: string | null;
  /** The version on screen is the one in review. */
  shown: boolean;
  active: boolean;
  /** Bumped when the demo resets, to start over. */
  resetKey: number;
  /** Roll on to the next transcript when one runs out. */
  loop?: boolean;
  /** Show the app's full tab strip (AI Assistant beside Transcript). */
  allTabs?: boolean;
}) {
  // What the feed is currently streaming to, and where it is in the text.
  const [streamingTo, setStreamingTo] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const cursorRef = useRef<Cursor | null>(null);
  const lastWordRef = useRef('');
  // Which transcript the next switch starts; cycles through them all.
  const nextTranscriptRef = useRef(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setStreamingTo(null);
    setSegments([]);
    cursorRef.current = null;
    lastWordRef.current = '';
    nextTranscriptRef.current = 0;
    setFinished(false);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;

    const start = (name: string) => {
      const transcript = nextTranscriptRef.current;
      nextTranscriptRef.current = (transcript + 1) % TRANSCRIPTS.length;
      cursorRef.current = {transcript, line: 0, word: 0};
      lastWordRef.current = '';
      setStreamingTo(name);
      setSegments([]);
      setFinished(false);
    };

    const tick = () => {
      const cursor = cursorRef.current;
      // Only switch (or stop) between sentences, so none is left hanging.
      const atBoundary = !cursor || cursor.word === 0 || endsSentence(lastWordRef.current);
      if (targetName !== streamingTo && atBoundary) {
        if (targetName === null) {
          cursorRef.current = null;
          setStreamingTo(null);
          setSegments([]);
        } else {
          start(targetName);
        }
        timer = setTimeout(tick, WORD_MS);
        return;
      }
      if (!cursor) return;

      const transcript = TRANSCRIPTS[cursor.transcript];
      const line = transcript.lines[cursor.line];
      if (!line) {
        if (loop && streamingTo !== null) {
          // A beat at the end, then the next transcript to the same version.
          timer = setTimeout(() => {
            start(streamingTo);
            timer = setTimeout(tick, WORD_MS);
          }, SENTENCE_MS * 2);
          return;
        }
        setFinished(true);
        return;
      }
      const words = line.text.split(' ');
      const word = words[cursor.word];
      const lineDone = cursor.word + 1 >= words.length;
      lastWordRef.current = word;
      setSegments((prev) => {
        const next = prev.slice();
        if (cursor.word === 0) {
          next.push({speaker: line.speaker, text: word, time: timeNow(), pending: !lineDone});
        } else {
          const last = next[next.length - 1];
          next[next.length - 1] = {...last, text: `${last.text} ${word}`, pending: !lineDone};
        }
        return next;
      });
      cursorRef.current = lineDone
        ? {...cursor, line: cursor.line + 1, word: 0}
        : {...cursor, word: cursor.word + 1};
      timer = setTimeout(tick, endsSentence(word) ? SENTENCE_MS : WORD_MS);
    };

    timer = setTimeout(tick, WORD_MS);
    return () => clearTimeout(timer);
  }, [active, targetName, streamingTo, loop]);

  // Keep the newest words in view.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [segments]);

  const live = shown && streamingTo !== null && !finished;
  const shownSegments = shown ? segments : [];

  return (
    <div className={styles.transcript}>
      {/* The app's tab strip above the panel: just the Transcript tab, or
          both with Transcript active. */}
      <div className={uiStyles.tabs}>
        {allTabs && (
          <button type="button" className={uiStyles.tab}>
            AI Assistant
          </button>
        )}
        <button type="button" className={clsx(uiStyles.tab, uiStyles.tabActive)}>
          Transcript
        </button>
      </div>

      <div className={styles.panel} aria-live="off">
        <div className={styles.statusBar}>
          <span className={styles.statusDot} />
          {live
            ? `Live • ${shownSegments.length} segment${shownSegments.length === 1 ? '' : 's'}`
            : 'Connected - waiting for transcript'}
        </div>

        {shownSegments.length === 0 ? (
          <div className={styles.emptyState}>
            <I.MessageSquare size={28} />
            <p>No transcript segments yet</p>
          </div>
        ) : (
          <div ref={listRef} className={styles.segmentList}>
            {shownSegments.map((segment, i) => {
              // The app shows the speaker once per run of their segments.
              const prev = i > 0 ? shownSegments[i - 1] : null;
              const showSpeaker = !prev || prev.speaker !== segment.speaker;
              return (
                <div key={i} className={clsx(styles.segment, showSpeaker && styles.segmentFirst)}>
                  {showSpeaker && (
                    <div className={styles.segmentHeader}>
                      <span className={styles.speaker}>{segment.speaker}</span>
                      <span className={styles.timestamp}>{segment.time}</span>
                    </div>
                  )}
                  <p className={clsx(styles.segmentText, segment.pending && styles.segmentPending)}>
                    {segment.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
