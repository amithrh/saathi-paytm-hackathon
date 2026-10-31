# Saathi — Paytm Build for India AI Hackathon (Bengaluru, Track 3)

**Team:** Saathi (Amit Mishra)
**Stage 1:** pitch deck submitted 27 Oct 2026 on devSemble
**Finals:** 31 Oct 2026, Paytm office, Bellandur, Bengaluru (page listed pincode 576103; Bellandur is 560103, confirm the address)

## The pitch
Saathi is a team of AI agents that owns a rupee revenue target for every Paytm merchant.
A Manager agent leads four specialists: Diagnoser, Fixer, Seller, Compliance.
It watches for money leaking (offline Soundbox, failed settlements, churn risk), fixes it,
confirms with the merchant over a Sarvam AI voice call in Kannada or Hindi or on WhatsApp,
then offers a loan they qualify for. A live dashboard counts rupees recovered and earned.
A human approves anything risky. Compliance checks consent, TRAI DND and calling hours,
and RBI Digital Lending rules before any action runs.

Closing line: "Other voice bots wait for questions. Saathi hunts for lost money and acts."

## Demo plan
- Real: Sarvam AI speech-to-text, text-to-speech and LLM; a real phone call (Exotel or Twilio trial); Paytm Payment Gateway sandbox actions (payment links, status, refunds).
- Simulated: merchant backend (Soundbox health, settlements, loan eligibility, transaction history) with a few hundred fake merchants and planted problems. Tool layer designed so swapping mock for real APIs is a config change.
- Demo moment: live Kannada or Hindi call where Saathi finds a failed settlement, retries it, confirms with the merchant, offers a loan, while the dashboard ticks up.

## Quickstart (prototype, built 30 Oct)

```bash
npm install
cp .env.example .env        # put SARVAM_API_KEY in .env
npm test                    # typecheck + 86 unit tests on the mock backend, agent loop, voice pipeline, Twilio transport
npm run demo                # one process: mock backend API, agent, call screen, dashboard, SSE
```

Then open `http://localhost:3000/dashboard?merchant=m001` on the projector and `http://localhost:3000/call?merchant=m001` on the laptop. `?merchant=m002` is the Kannada merchant. The full talk track, judge lines, rehearsal checklist and fallback ladder are in [scripts/demo.md](scripts/demo.md).

Offline survival: `npm run cache-tts` (once, online) pre-synthesises every line of the scripted scene into `recordings/cache/`; `npm run demo:offline` then runs the same tools and dashboard with a scripted brain and cached audio and no network at all (judge lines typed or via `record-demo`).

Other commands:
- `npm run record-demo` plays the scripted Ravi conversation through the speakers and drives the dashboard without a microphone (`--voice` sends the judge lines as synthesised audio so STT runs too; `--no-play` is the silent automated check; `--merchant m002` for Kannada). Saves a WAV and transcript under `recordings/`.
- `npm run transcript -- m001` runs the conversation as text against the live Sarvam LLM and prints every tool call with its role.
- `npm run test:live` runs the Hindi and Kannada conversations against Sarvam and asserts the tool order (compliance before each gated action, human approval raised, call ended by the agent).
- `npm run live:check` is the pre-flight for the phone and WhatsApp path: validates the Twilio credentials, that `DEMO_PHONE_NUMBER` is a verified caller ID on a trial account, that `PUBLIC_BASE_URL` reaches this server, and (with `--send`) sends one WhatsApp test message. Prints a pass/fail table.
- WhatsApp sandbox one-time step: each phone that should receive a message sends `join <sandbox-code>` to +1 415 523 8886 (code in Twilio console under Messaging > Try it out). The opt-in lasts 72 hours, so do it on the morning of the demo.
- Rehearsing after 21:00 IST: `SAATHI_FAKE_NOW=2026-10-31T10:15:00+05:30 npm run demo`, otherwise the compliance check correctly refuses outside calling hours.

### Guardrails on screen
- The compliance panel on the dashboard is driven by the structured `gates` array that `compliance_check` returns: AI disclosed, calling window 9 AM to 7 PM IST (TRAI TCCCPR 2025), consent with timestamp, Key Fact Statement (amount, APR, tenure, EMI), cooling-off 1 day (RBI Digital Lending Directions 2025), human approval pending. Disburse is a human-only button and even then only hands the file to the lending partner (sandbox).
- Every rupee figure Saathi speaks is checked against the numbers returned by tools on that call; the verdict is a `number_audit` line in the action log. Each log line also names its ledger source.
- Udhaar reminders carry a verified-merchant P2M UPI pay intent (merchant VPA, MCC, transaction reference), never a P2P collect request.
- Deterministic triggers: device silent more than 30 minutes while inflows continue; settlement pending or failed past T+1; udhaar line older than 10 days. `GET /api/policy` lists them with what the model may not do.

### What is real and what is mocked
- Real: Sarvam speech-to-text (`saarika:v2.5`), text-to-speech (`bulbul:v3`, speaker `priya`, Hindi and Kannada), reasoning and tool calling (`sarvam-105b-conversations`). The agent decides which tools to call; nothing in the conversation is scripted on the Saathi side.
- Simulated: the merchant backend (`backend/`): 20 seeded merchants, transactions, Soundbox events, settlements, udhaar ledger, last year's seasonal pattern, loan eligibility. Tools are a typed registry with an HTTP surface (`POST /api/tools/:name`), so each one can be pointed at a real Paytm API without touching the agent.
- WhatsApp: mocked by default (rendered on the dashboard and logged). With `TWILIO_WHATSAPP_FROM` and `SURESH_PHONE_NUMBER` in `.env` the same tool sends the real message through the Twilio WhatsApp Sandbox and the dashboard shows "sent via WhatsApp" with the message SID; a failed live send falls back to the dashboard and says so. The customer "paying" 25 s after a mock reminder is a simulation, labelled as such; it is not simulated for live sends.
- Phone: the browser call screen is the primary transport. Twilio Media Streams is implemented and unit-tested against a fake stream (`twilio/`) but has not been exercised live; it needs `TWILIO_*`, `DEMO_PHONE_NUMBER` and a public `PUBLIC_BASE_URL` (ngrok) in `.env`.

### How it is built
- `backend/` mock merchant backend, tool registry with a fixed role per tool (Diagnoser: get_briefing; Fixer: restart_device, retry_settlement, send_reminder; Seller: check_loan_eligibility, offer_loan; Compliance: compliance_check; Manager: request_human_approval, end_call), compliance tickets gating send_reminder and offer_loan, event bus.
- `agent/` one agent on Sarvam's LLM with those tools. The system prompt sets the language, the speech style and the call flow; the tool layer enforces consent and compliance regardless of what the model does.
- `voice/` audio in, Sarvam STT, agent, Sarvam TTS (split by sentence, synthesised in parallel, streamed in order), audio out. The briefing is prepared while the phone rings. Browser transport over WebSocket with tap-to-talk.
- `twilio/` the same pipeline over Twilio Media Streams (mu-law 8 kHz both ways, energy VAD for end of utterance), outbound dialling via REST.
- `dashboard/` the projector page, fed by server-sent events.

### Measured latency (30 Oct, home Wi-Fi)
Per merchant turn: STT 135 to 285 ms, LLM 430 to 1,390 ms across 2 to 4 calls, tools under 5 ms, TTS to first audio 0.8 to 1.8 s, total 1.5 to 3.2 s from end of speech to first word back. The opening briefing takes 4 to 5 s to prepare and is ready before the merchant answers.

## Open items (as of 30 Oct)
- Twilio phone path untested live (no credentials yet). Browser call is the plan A.
- The full call runs about 95 s with prompt replies; the judge can end it sooner with "ठीक है, धन्यवाद".
- Worked rupee example for the impact slide left for the talk track (judges will ask "why 60%?").

## Folder layout
- `deck/` — submitted pptx and pdf (7 slides: Title, Problem, Solution, Tech Stack, USP, Impact, Business Model)
- `deck-src/` — pptxgenjs build script; `cd deck-src && npm install && node build.js`

## Sarvam AI (verified 30 Oct 2026)
Key lives in `.env` as `SARVAM_API_KEY` (never committed). Working endpoints and models:
- TTS: `POST https://api.sarvam.ai/text-to-speech`, model `bulbul:v3`, speaker `priya` (others: aditya, ritu, neha, rahul, kavya, amit, roopa, kavitha...), `target_language_code` hi-IN and kn-IN both return WAV. Header `api-subscription-key`.
- STT: `POST https://api.sarvam.ai/speech-to-text` multipart `file`, model `saarika:v2.5` or `saaras:v3`, `language_code` hi-IN. Transcribed our own clip exactly.
- LLM: `POST https://api.sarvam.ai/v1/chat/completions`, model `sarvam-105b-conversations`, header `Authorization: Bearer`.
- Deprecated, do not use: bulbul:v2, speaker anushka, sarvam-m.
