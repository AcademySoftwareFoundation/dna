// Utility: Clean text
export const cleanText = (text) => {
  if (!text) return ""
  return text.trim().replace(/\s+/g, " ")
}

// Utility: Key by absolute_start_time
export const getAbsKey = (segment) => {
  return segment.absolute_start_time || segment.timestamp || segment.created_at || `no-utc-${segment.id || ''}`
}

// Utility: Merge segments by absolute UTC
export const mergeByAbsoluteUtc = (prev, incoming) => {
  const map = new Map()
  for (const s of prev) {
    const key = getAbsKey(s)
    if (key.startsWith('no-utc-')) continue
    map.set(key, { ...s, text: cleanText(s.text) })
  }
  for (const s of incoming) {
    if (!s.absolute_start_time) continue
    const key = getAbsKey(s)
    if (key.startsWith('no-utc-')) continue
    const existing = map.get(key)
    const candidate = { ...s, text: cleanText(s.text) }
    if (existing && existing.updated_at && candidate.updated_at) {
      if (candidate.updated_at < existing.updated_at) continue
    }
    map.set(key, candidate)
  }
  return Array.from(map.values()).sort((a, b) => {
    const at = new Date(a.absolute_start_time || a.timestamp).getTime()
    const bt = new Date(b.absolute_start_time || b.timestamp).getTime()
    return at - bt
  })
}

// Split long text into chunks without breaking sentences
export function splitTextIntoSentenceChunks(text: string, maxLen: number): string[] {
  const normalized = (text || "").trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLen) return [normalized]
  // Split into sentences on punctuation boundaries. Keep punctuation.
  const sentences = normalized.split(/(?<=[.!?])\s+/)
  if (sentences.length === 1) {
    // Single long sentence: return as one chunk to avoid breaking the sentence
    return [normalized]
  }
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length === 0) {
      if (sentence.length > maxLen) {
        chunks.push(sentence)
      } else {
        current = sentence
      }
    } else if (current.length + 1 + sentence.length <= maxLen) {
      current = current + ' ' + sentence
    } else {
      chunks.push(current)
      if (sentence.length > maxLen) {
        chunks.push(sentence)
        current = ''
      } else {
        current = sentence
      }
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export interface SpeakerGroup {
  speaker: string
  startTime: string
  endTime: string
  combinedText: string
  segments: any[]
  isMutable: boolean
  isHighlighted: boolean
}

// Group consecutive segments by speaker and combine text
export function groupSegmentsBySpeaker(
  segments: any[],
  mutableSegmentIds: Set<string> = new Set(),
  newMutableSegmentIds: Set<string> = new Set()
): SpeakerGroup[] {
  if (!segments || segments.length === 0) return []
  // Sort segments by absolute UTC
  const sorted = [...segments].sort((a, b) => {
    const aUtc = a.absolute_start_time || a.timestamp
    const bUtc = b.absolute_start_time || b.timestamp
    const aHasUtc = !!a.absolute_start_time
    const bHasUtc = !!b.absolute_start_time
    if (aHasUtc && !bHasUtc) return -1
    if (!aHasUtc && bHasUtc) return 1
    const at = new Date(aUtc).getTime()
    const bt = new Date(bUtc).getTime()
    return at - bt
  })
  const groups: SpeakerGroup[] = []
  let current: SpeakerGroup | null = null
  for (const seg of sorted) {
    const speaker = seg.speaker || 'Unknown Speaker'
    const text = cleanText(seg.text)
    const startTime = seg.absolute_start_time || seg.timestamp
    const endTime = seg.absolute_end_time || seg.timestamp
    const segKey = getAbsKey(seg)
    const segIsMutable = mutableSegmentIds.has(segKey)
    const segIsHighlighted = newMutableSegmentIds.has(segKey)
    if (!text) continue
    if (current && current.speaker === speaker) {
      current.combinedText += ' ' + text
      current.endTime = endTime
      current.segments.push(seg)
      current.isMutable = current.isMutable || segIsMutable
      current.isHighlighted = current.isHighlighted || segIsHighlighted
    } else {
      if (current) groups.push(current)
      current = {
        speaker,
        startTime,
        endTime,
        combinedText: text,
        segments: [seg],
        isMutable: segIsMutable,
        isHighlighted: segIsHighlighted
      }
    }
  }
  if (current) groups.push(current)
  // Split long combinedText into chunks for readability (max 512 chars)
  const MAX_CHARS = 512
  const splitGroups: SpeakerGroup[] = []
  for (const g of groups) {
    const chunks = splitTextIntoSentenceChunks(g.combinedText, MAX_CHARS)
    if (chunks.length <= 1) {
      splitGroups.push(g)
    } else {
      for (const chunk of chunks) {
        splitGroups.push({
          speaker: g.speaker,
          startTime: g.startTime,
          endTime: g.endTime,
          combinedText: chunk,
          segments: g.segments,
          isMutable: g.isMutable,
          isHighlighted: g.isHighlighted
        })
      }
    }
  }
  return splitGroups
}
