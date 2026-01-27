export type Word = {
    text: string
    start_timestamp: { relative: number; absolute: string }
    end_timestamp: { relative: number; absolute: string }
  }
  
  export type TranscriptChunk = {
    participant: {
      id: number
      name: string
      email?: string | null
    }
    words: Word[]
  }
  
  export type Utterance = {
    participantName: string
    startRel: number
    endRel: number
    text: string
  }
  
  function joinWords(words: string[]) {
    return words.join(" ").replace(/\s+([,.!?;:])/g, "$1")
  }
  
  export function chunksToUtterances(chunks: TranscriptChunk[]): Utterance[] {
    const utterances: Utterance[] = []
  
    for (const chunk of chunks) {
      let buffer: Word[] = []
      let lastEnd: number | null = null
  
      const flush = () => {
        if (!buffer.length) return
        utterances.push({
          participantName: chunk.participant.name,
          startRel: buffer[0].start_timestamp.relative,
          endRel: buffer[buffer.length - 1].end_timestamp.relative,
          text: joinWords(buffer.map(w => w.text))
        })
        buffer = []
        lastEnd = null
      }
  
      for (const w of chunk.words) {
        if (lastEnd !== null && w.start_timestamp.relative - lastEnd > 1.2) {
          flush()
        }
        buffer.push(w)
        lastEnd = w.end_timestamp.relative
      }
  
      flush()
    }
  
    return utterances.sort((a, b) => a.startRel - b.startRel)
  }
  
  export function utterancesToReadableText(u: Utterance[]) {
    return u.map(x => `${x.participantName}: ${x.text}`).join("\n")
  }
  