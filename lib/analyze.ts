// lib/analyze.ts
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"
import { openai } from "./openai"
import { chunksToUtterances, utterancesToReadableText } from "./transcript"

export const DecisionSchema = z.object({
  meeting_was_worth_it: z.boolean(),
  sassy_verdict: z.string().min(1),

  should_schedule: z.boolean(),
  firm_verdict: z.string().min(1),

  confidence: z.number().min(0).max(1),

  suggested_title: z.string().nullable(),
  suggested_when: z.string().nullable(),

  // NEW (for .ics)
  suggested_start_iso: z.string().nullable(),
  duration_minutes: z.number().int().min(5).max(240).nullable()
})


export type Decision = z.infer<typeof DecisionSchema>

export async function analyzeTranscriptWithOpenAI(transcriptChunks: any[]): Promise<Decision> {
  const utterances = chunksToUtterances(transcriptChunks)
  const readable = utterancesToReadableText(utterances)

  const system = `
    You are Chief of Recall. You MUST return JSON that matches the schema.

    Output requirements:
    1) "sassy_verdict": in a sassy tone, decide whether this should have been a meeting at all.
      - Set "meeting_was_worth_it" true if the meeting had meaningful decisions made.
      - Otherwise false (e.g., could’ve been an email / quick async update).

    2) "firm_verdict": in a firm tone, decide whether a follow-up meeting should be scheduled.
      - Set "should_schedule" true ONLY if there is explicit intent to meet again OR a clear need to sync again (action items and/or timeframe).
      - Do NOT schedule based only on polite closings like "see you next time" unless a concrete reason/timeframe is stated.

    Scheduling fields:
    - If follow-up timing is explicitly discussed (e.g., "tomorrow at 3pm", "next Tuesday", "in two weeks"), put that in "suggested_when".
    - If timing is NOT explicitly discussed, set "suggested_when" to null.
    - If a title is clear, set "suggested_title"; otherwise null.

    Always return ALL fields.
  `.trim()

  const resp = await openai.responses.parse({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: `Transcript:\n${readable}` }
    ],
    text: { format: zodTextFormat(DecisionSchema, "decision") }
  })

  if (!resp.output_parsed) throw new Error("Failed to parse decision from OpenAI response")
  return resp.output_parsed
}
