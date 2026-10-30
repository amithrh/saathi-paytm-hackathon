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

## Open items (as of 27 Oct)
- No prototype built yet.
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
