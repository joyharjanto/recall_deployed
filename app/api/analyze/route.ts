// app/api/analyze/route.ts
import { NextResponse } from "next/server"
import { analyzeTranscriptWithOpenAI } from "../../../lib/analyze"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    status: "alive",
    openaiKeyExists: !!process.env.OPENAI_API_KEY
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const transcript = body?.transcript

    if (!Array.isArray(transcript)) {
      return NextResponse.json(
        { error: "Body must be { transcript: [...] } (transcript must be an array)" },
        { status: 400 }
      )
    }

    const decision = await analyzeTranscriptWithOpenAI(transcript)

    return NextResponse.json({ decision })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
