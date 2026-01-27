// app/api/recall/start/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { meeting_url } = await req.json()
    if (!meeting_url) {
      return NextResponse.json({ error: "meeting_url required" }, { status: 400 })
    }

    const base = process.env.RECALL_BASE_URL
    const key = process.env.RECALL_API_KEY
    if (!base || !key) {
      return NextResponse.json({ error: "Missing RECALL_BASE_URL or RECALL_API_KEY" }, { status: 500 })
    }

    const resp = await fetch(`${base}/api/v1/bot`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        meeting_url,
        bot_name: "Meeting Notetaker",
        recording_config: {
          transcript: {
            provider: {
              meeting_captions: {} 
            }
          }
        }
      })
    })

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json({ error: text }, { status: resp.status })
    }

    const bot = await resp.json()
    return NextResponse.json({ bot_id: bot.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
