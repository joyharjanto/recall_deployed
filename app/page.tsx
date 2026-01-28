"use client"

import { useEffect, useState } from "react"

type Decision = {
  meeting_was_worth_it: boolean
  sassy_verdict: string

  should_schedule: boolean
  firm_verdict: string

  confidence: number
  suggested_title: string | null
  suggested_when: string | null

  // optional for future (if you add these to analyze schema)
  suggested_start_iso?: string | null
  duration_minutes?: number | null
}

type StatusResponse = {
  bot_id: string
  status: string
  decision?: Decision
  error?: string
}

function isLikelyMeetUrl(url: string) {
  return /meet\.google\.com\/[a-zA-Z0-9-]+/.test(url)
}

export default function Page() {
  const [meetingUrl, setMeetingUrl] = useState("")
  const [botId, setBotId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("")
  const [decision, setDecision] = useState<Decision | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ICS UI state
  const [icsStartIso, setIcsStartIso] = useState("")
  const [icsDuration, setIcsDuration] = useState<number>(30)

  async function startBot() {
    setLoading(true)
    setError(null)
    setDecision(null)
    setStatus("")
    setBotId(null)

    // reset ICS state
    setIcsStartIso("")
    setIcsDuration(30)

    try {
      const url = meetingUrl.trim()
      if (!url) throw new Error("Paste a meeting link first.")
      if (!isLikelyMeetUrl(url)) {
        console.warn("URL does not look like a Google Meet link.")
      }

      const r = await fetch("/api/recall/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_url: url })
      })

      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? "Failed to start Recall bot")

      setBotId(data.bot_id)
      setStatus(data.status ?? "created")
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function downloadICS() {
    try {
      if (!decision?.should_schedule) return

      const startIso = (decision.suggested_start_iso ?? icsStartIso).trim()
      if (!startIso) {
        throw new Error(
          "No exact start time yet. Paste a start time like 2026-01-27T15:00:00-08:00, then download again."
        )
      }

      const r = await fetch("/api/calendar/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: decision.suggested_title ?? "Follow-up meeting",
          start_iso: startIso,
          duration_minutes: decision.duration_minutes ?? icsDuration ?? 30,
          description: decision.firm_verdict,
          location: meetingUrl || ""
        })
      })

      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err?.error ?? "Failed to generate .ics")
      }

      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "follow-up.ics"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message ?? "ICS download failed")
    }
  }

  useEffect(() => {
    if (!botId) return

    let cancelled = false
    let timer: any = null

    const poll = async () => {
      try {
        const r = await fetch(`/api/recall/status?bot_id=${encodeURIComponent(botId)}`)
        const data: StatusResponse = await r.json()

        if (cancelled) return
        if (!r.ok) {
          setError(data?.error ?? "Status check failed")
          return
        }

        setStatus(data.status)

        if (data.decision) {
          setDecision(data.decision)

          // Prefill ICS fields if model provides them later
          setIcsStartIso((data.decision.suggested_start_iso ?? "").trim())
          setIcsDuration(data.decision.duration_minutes ?? 30)

          return // stop polling once decision exists
        }

        timer = setTimeout(poll, 2500)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? "Polling failed")
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [botId])

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: "12px 0", fontSize: 28 }}>Chief of Staff: Recall</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Recall Bot will make your life easier for you!
      </p>

      <br />

      <input
        value={meetingUrl}
        onChange={e => setMeetingUrl(e.target.value)}
        placeholder="Link to active Google Meet"
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #2a2f3a",
          background: "#13151b",
          color: "#e8e8ea"
        }}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={startBot}
          disabled={loading || !meetingUrl.trim()}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #2a2f3a",
            background: "#1c2330",
            color: "#e8e8ea",
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Sending bot..." : "Send Recall Bot"}
        </button>

        {error ? <span style={{ color: "tomato" }}>{error}</span> : null}
      </div>

      {botId ? (
        <section
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            border: "1px solid #2a2f3a",
            background: "#0f121a"
          }}
        >
          <div><b>Bot ID:</b> {botId}</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            <b>Status:</b> {status || "starting..."} (auto-refreshing)
          </div>

          {!decision ? (
            <div style={{ marginTop: 12, opacity: 0.8 }}>
              Waiting for the meeting to finish, then transcript analysis will run automatically…
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#13151b" }}>
              <div style={{ display: "grid", gap: 12 }}>
                {/* Row 1 */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    1) Should this have been a meeting?
                  </div>
                  <div>
                    {decision.meeting_was_worth_it
                      ? "It was actually a good meeting."
                      : "Ugh, that should’ve been an email."}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    {decision.sassy_verdict?.trim()
                      ? decision.sassy_verdict
                      : "(No sassy verdict returned.)"}
                  </div>
                </div>

                {/* Row 2 */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    2) Should we schedule a follow-up?
                  </div>
      
                  <div style={{ marginTop: 6, opacity: 0.9 }}>{decision.firm_verdict}</div>

                  {decision.should_schedule && decision.suggested_when ? (
                    <div style={{ marginTop: 8 }}>
                      <b>When (as discussed):</b> {decision.suggested_when}
                    </div>
                  ) : null}

                  {decision.should_schedule ? (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 12,
                        background: "#0f121a",
                        border: "1px solid #2a2f3a"
                      }}
                    >
          
                      <div style={{ display: "grid", gap: 8 }}>
                        <button
                          onClick={downloadICS}
                          style={{
                            width: "fit-content",
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #2a2f3a",
                            background: "#1c2330",
                            color: "#e8e8ea",
                            cursor: "pointer"
                          }}
                        >
                          Send calendar invite
                        </button>

                      </div>
                    </div>
                  ) : null}
                </div>

          
              </div>
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}
