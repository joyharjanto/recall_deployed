// app/api/recall/status/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

function isDoneStatus(code: string) {
  const s = (code || "").toLowerCase()
  return s === "done" || s === "recording_done" || s === "call_ended"
}

async function readJsonSafe(resp: Response) {
  const text = await resp.text()
  try {
    return { ok: resp.ok, status: resp.status, json: JSON.parse(text), text }
  } catch {
    return { ok: resp.ok, status: resp.status, json: null, text }
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const botId = searchParams.get("bot_id")
    if (!botId) return NextResponse.json({ error: "bot_id required" }, { status: 400 })

    const base = process.env.RECALL_BASE_URL
    const key = process.env.RECALL_API_KEY
    if (!base || !key) {
      return NextResponse.json({ error: "Missing RECALL_BASE_URL or RECALL_API_KEY" }, { status: 500 })
    }

    // 1) Fetch bot
    const botResp = await fetch(`${base}/api/v1/bot/${botId}/`, {
      headers: { Authorization: `Token ${key}` }
    })
    const botParsed = await readJsonSafe(botResp)
    if (!botParsed.ok) {
      return NextResponse.json(
        { error: `Recall bot fetch failed (${botParsed.status})`, details: botParsed.json ?? botParsed.text },
        { status: 500 }
      )
    }

    const bot: any = botParsed.json
    const changes = Array.isArray(bot?.status_changes) ? bot.status_changes : []
    const last = changes.length ? changes[changes.length - 1] : null
    const code = (last?.code as string) ?? "unknown"

    // Not finished yet
    if (!isDoneStatus(code)) {
      return NextResponse.json({ bot_id: botId, status: code })
    }

    // 2) Find transcript media shortcut from recordings
    const recordings = Array.isArray(bot?.recordings) ? bot.recordings : []
    const latestRec = recordings.length ? recordings[recordings.length - 1] : null

    const transcriptUrl =
      latestRec?.media_shortcuts?.transcript?.data?.download_url ??
      latestRec?.media_shortcuts?.transcript?.data?.transcript_download_url ??
      null

    if (!transcriptUrl) {
      return NextResponse.json({
        bot_id: botId,
        status: code,
        transcript_not_ready: true,
        hint: "Meeting ended, but transcript artifact not available yet. Keep polling.",
        recordings_count: recordings.length
      })
    }

    // 3) Download transcript
    const tResp = await fetch(transcriptUrl)
    const tParsed = await readJsonSafe(tResp)
    if (!tParsed.ok) {
      return NextResponse.json({
        bot_id: botId,
        status: code,
        transcript_not_ready: true,
        hint: "Transcript URL exists but is not downloadable yet. Keep polling.",
        transcript_fetch_status: tParsed.status,
        recall_error: tParsed.json ?? tParsed.text
      })
    }

    const chunks = tParsed.json
    if (!Array.isArray(chunks)) {
      return NextResponse.json({
        bot_id: botId,
        status: code,
        error: "Transcript download was not an array",
        transcript_preview: chunks
      })
    }

    // 4) Analyze
    const { analyzeTranscriptWithOpenAI } = await import("../../../../lib/analyze")
    const decision = await analyzeTranscriptWithOpenAI(chunks)

    return NextResponse.json({ bot_id: botId, status: "done", decision })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
