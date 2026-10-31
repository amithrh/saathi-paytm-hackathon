# Saathi: the 4:30 pitch and the 90-second scene

Finals, 31 Oct 2026, Paytm Bellandur. One laptop, one projector, one judge playing Ravi. Submission window about 17:00 IST; the demo video is a required deliverable.

## The first twenty seconds (say it exactly)

"This is Saathi, an autonomous service and sales teammate for Paytm. It resolves a merchant's problem before a ticket exists, and it closes a first-time loan with a human on the money step. That is Track 3. The screen is its scoreboard: rupees it moved for one Jayanagar kirana this week."

Point at the scoreboard, then: "Tuesday evening, 6:02 PM. Ravi's Soundbox went silent. Seven payments landed in the app unannounced; customers walked out thinking the payment failed. This morning Saathi noticed, fixed it, and is calling him. Ravi, your phone is ringing."

## Timing: 4 minutes 30 seconds, hard cuts

| Clock | Beat | What is on screen |
|---|---|---|
| 0:00 | Track 3 line and scoreboard (15 s) | Dashboard, counters at week-to-date |
| 0:15 | The scene set-up (15 s), click **Ring the merchant** | Log shows Diagnoser and Fixer before the phone is answered; Recovered ticks |
| 0:30 | Live call: opening, reminder, loan, goodbye (about 95 s) | Transcript, WhatsApp bubble, gates filling, Escalated to human |
| 2:10 | Compliance gate walk-through (45 s): AI disclosed, 9 to 7 window, consent time, KFS, cooling-off, greyed Disburse. Click Approve, then Disburse | Gates panel, hand-off line in the log |
| 2:55 | "What the LLM is not allowed to do" (20 s): open the footer panel, read two lines | Policy panel |
| 3:15 | Impact and model (45 s): tickets deflected, udhaar recovered, first-time borrowers against the 7 percent base; ₹30 to 50 a month on the Soundbox subscription; ₹3 to 5 per call | Back to scoreboard |
| 4:00 | Team and ask (30 s): built solo, repo and tests ready to hand to a Paytm team, want the mentor conversation | Scoreboard |
| 4:30 | Stop talking | |

If the call runs long, cut the policy panel first, then shorten impact to one sentence. Never cut the gates.

## Setup (10 minutes before)

1. Laptop on power, Wi-Fi or hotspot confirmed (`curl -s https://api.sarvam.ai >/dev/null && echo ok`).
2. In the repo: `npm run demo`. Wait for the banner. If it is after 21:00 or before 09:00 IST (rehearsals), start with
   `SAATHI_FAKE_NOW=2026-10-31T10:15:00+05:30 npm run demo` or compliance will refuse the reminder and the loan, which is correct but not what you want on stage.
3. Projector: `http://localhost:3000/dashboard?merchant=m001` in a full-screen browser window (press F11 / Cmd+Ctrl+F). Zoom to 110 to 125 percent if the hall is deep.
4. Laptop screen (or a second window facing the judge): `http://localhost:3000/call?merchant=m001`. Click once anywhere so the browser allows audio. Allow the microphone when asked.
5. Laptop volume up, or an external speaker plugged in. The judge speaks into the laptop mic from about 30 cm.
6. Do one silent run with `npm run record-demo -- --no-play` to warm up the APIs, then restart `npm run demo` so the data is fresh (the counters start at zero).

## Talk track (you) and judge lines

Time budget: 10 s setup line, 75 to 95 s call, 10 s close. The call itself runs about 95 s with the merchant answering promptly.

**You (10 s):** the two paragraphs from "The first twenty seconds" above.

Click **Ring the merchant** on the call screen while you say that. The dashboard log shows Diagnoser and Fixer work before the phone is even answered: briefing pulled, Soundbox restarted, Recovered ticks to ₹1,340.

**Judge:** taps **Answer**.

**Saathi (Hindi, about 30 s):** first sentence says it is Paytm's AI assistant (the TRAI disclosure); then the Soundbox went silent at 6:02, 7 payments worth ₹1,340 landed unannounced so customers may have thought the payment failed, it restarted the device and all 7 are confirmed; yesterday ₹14,200 from 50 payments; Suresh owes ₹2,300 for 12 days; asks whether to send a WhatsApp reminder with a UPI link.

**Judge (tap mic, speak, tap again):** हाँ, सुरेश को रिमाइंडर भेजो।
(Haan, Suresh ko reminder bhejo. "Yes, send Suresh a reminder.")

Dashboard: Compliance entry (7 checks: AI disclosure, 9 to 7 window, merchant consent, ledger line, 72-hour cap, transactional template, P2M link), then Fixer sends; the WhatsApp message appears in Hindi with a verified-merchant P2M link, labelled "no collect request". About 25 s later Suresh "pays" and Collected ticks. Say: "That is a P2M pay link, not a collect request; collect died last October. The WhatsApp send is mocked unless the sandbox is wired."

**Saathi (about 30 s):** confirms the reminder went, then the loan: ₹50,000, because last year sales rose 34% around Diwali and Diwali is 8 days away, 6 months at 18% a year, about ₹9,080 a month, from a partner NBFC via Paytm, 1-day cooling-off. Asks if he wants it.

**Judge:** हाँ, लोन चाहिए, आगे बढ़ो।
(Haan, loan chahiye, aage badho. "Yes, I want the loan, go ahead.")

Dashboard: the Compliance gates panel fills from the real tool result: AI disclosed, calling window 9 AM to 7 PM, offer opt-in on record, lender named, KFS read (₹50,000, 18% APR, 6 months, EMI ≈ ₹9,080), consent logged with the time, cooling-off 1 day, awaiting human approval. The log shows "Escalated to human". Offered ticks to ₹50,000. The Disburse button is grey: "agent cannot press this". Click **Approve** while saying: "Nothing moves until a human at Paytm approves. Here is that human." Then click **Disburse** and read the log line: handed to the lending partner, no funds move.

**Saathi:** says a Paytm team member will approve and details come on WhatsApp, asks if anything else.

**Judge:** ठीक है, धन्यवाद।
(Theek hai, dhanyavaad. "Okay, thank you.")

**Saathi:** says goodbye and ends the call itself.

**You (10 s):** "Every rupee Saathi spoke was a tool result; the number audit lines in the log prove it. Other voice bots wait for questions. Saathi hunts for lost money and acts, and it asks a human before the money step."

### Kannada variant (Lakshmi, Basavanagudi)

Use `?merchant=m002` on both pages. The planted problem is a failed settlement of ₹8,450 which Saathi retries before the call; the udhaar is Manjunath's ₹1,800 for 15 days; the loan is ₹30,000.

- ಹೌದು, ಮಂಜುನಾಥ್‌ಗೆ ರಿಮೈಂಡರ್ ಕಳಿಸಿ. (Houdu, Manjunath-ge reminder kalisi.)
- ಹೌದು, ಲೋನ್ ಬೇಕು, ಮುಂದುವರಿಸಿ. (Houdu, loan beku, munduvarisi.)
- ಸರಿ, ಧನ್ಯವಾದಗಳು. (Sari, dhanyavaadagalu.)

## Live variant: real phone and real WhatsApp (when Twilio is configured)

Two judges. Judge A is Ravi and holds the phone whose number is `DEMO_PHONE_NUMBER`. Judge B is Suresh and holds the phone whose number is `SURESH_PHONE_NUMBER`; that phone must have sent the WhatsApp sandbox join code the same morning.

Morning of the demo:
1. `ngrok http 3000`, paste the https URL into `PUBLIC_BASE_URL` in `.env`, start `npm run demo`.
2. `npm run live:check -- --send`. Everything PASS, and judge B's phone received the test message. If anything fails, drop to the laptop variant; do not debug on stage.
3. Keep this ready in a terminal:
   `curl -X POST localhost:3000/twilio/call -H 'content-type: application/json' -d '{"merchantId":"m001"}'`

On stage:
- **You:** "Ravi's phone is about to ring. Suresh, keep your phone face up." Run the curl. Saathi prepares the briefing while Twilio dials (about 5 s). Trial accounts play a short Twilio notice first; say "that is the trial account" and move on.
- **Judge A** answers; hears the briefing on the handset (put it on speaker for the room); says हाँ, सुरेश को रिमाइंडर भेजो।
- **Judge B's** phone buzzes with the Hindi WhatsApp and the UPI link, usually within 2 to 5 s. Dashboard says "sent via WhatsApp" with the message SID. Hold the phone up to the camera or the room.
- Loan and goodbye exactly as in the laptop script. Approve on the dashboard.
- There is no voice activity detection on the laptop path, but on the phone path there is: judge A should pause about a second after speaking, and should not talk over Saathi.

Fallback ladder, in order:
1. Live phone (Twilio) with live WhatsApp.
2. Laptop call screen (`/call`) with the microphone; WhatsApp still live if configured, otherwise the dashboard bubble.
3. Laptop call screen with the typed line.
4. `npm run record-demo` through the speakers.
5. Recorded WAV from `recordings/` plus a screen recording of the dashboard.

## Judge Q&A crib (one line each, then point at the screen)

| They say | You say |
|---|---|
| BharatPe shipped this six weeks ago | BharatPe answers when asked, in-app. Saathi calls when the Soundbox goes silent or a settlement sticks, and it reaches the merchant's customers. |
| Our AI Soundbox speaks 11 languages | It answers questions on a new device. Saathi initiates on events, over phone and WhatsApp, for the 1.64 crore ordinary Soundboxes already out there. |
| Khatabook and Business Khata do reminders | Those are merchant-scheduled blasts. Saathi decides whom, when and in which language from ledger ageing, and the conversation ends in a payment. |
| Isn't this Sarvam's collections cookbook | Telephony and TTS are commodity on purpose. The IP is the trigger rules, the consent wrapper and rupee attribution; that panel on the right. |
| Who is the lender? This is robot mis-selling | Saathi is only the LSP surface: it reads the KFS and APR, never touches funds, never raises limits, 1-day cooling-off, consent timestamped. Those are the gates on screen. |
| Cold AI calls are spam | Merchant-consented at onboarding, AI disclosed in sentence one, 9 AM to 7 PM only, and the loan step checks the offer opt-in separately. |
| The LLM will hallucinate my balance | Every rupee is a deterministic aggregate; the model only phrases it. The number audit line in the log checks each spoken amount against tool results. |
| Kannada ASR in a noisy shop | Vocabulary is ledger names and amounts, every number is confirmed back, and the fallback is a typed line or WhatsApp. Today's run transcribed every judge line exactly. |
| P2P collect is banned, how do they pay | Saathi never sends collect requests. The link is the merchant's verified P2M pay intent with MCC; it says so on the bubble. |
| You are one person | Built solo in two days; the repo has 86 tests, an audit log and a hand-over README written for a Paytm team on Monday. Hiring is a listed outcome; I want that conversation. |
| Why Track 3 and not Track 1 | It resolves a support ticket before it exists and closes a loan sale with a human on the money step: sales or customer service, takes actions, escalates to humans. |

Numbers you may quote as fact: 1.64 crore Soundboxes and 5.2 crore registered merchants (Paytm Q2 FY27); about 7 percent of subscription merchants have a loan and over half of disbursements are repeats; financial-services distribution ₹912 crore a quarter, up 49 percent. Say "vendor surveys put it at roughly" before any udhaar-loss figure.

## If the judge goes off script

The agent is live, not a recording. It handles "no" (skips the reminder, still offers the loan; declines gracefully), questions it has data for (yesterday's count, other udhaar names, the device), and says honestly when it does not have data. If the mic picks up noise, Saathi asks them to repeat. The **text box** on the call screen sends a typed line through the same agent; use it if the room is loud.

## Fallback ladder

1. Mic trouble: type the judge's line in the text box on the call screen. Same agent, same dashboard, no STT.
2. Browser audio trouble: `npm run record-demo` in a second terminal plays the whole scripted conversation through the laptop speakers and drives the dashboard live (it uses the same WebSocket as the call screen). Add `--voice` to send the judge's lines as synthesised audio so STT is exercised too.
3. No internet: nothing works live (Sarvam is the brain and the voice). Play `recordings/<latest>.wav` from a rehearsal run and screen-record the dashboard beforehand. Record one good run tonight: `npm run record-demo` (it saves the WAV and a transcript under `recordings/`).

## Rehearsal checklist

- [ ] `npm test` green.
- [ ] `npm run demo` banner shows the Sarvam models and a sane clock.
- [ ] Dashboard loads with Recovered/Collected/Offered at ₹0, Soundbox SB-7F42 offline, Suresh ₹2,300 at 12 days.
- [ ] Call screen: Ring, phone rings within 6 s, Answer plays the greeting within a second.
- [ ] Say the three judge lines yourself into the mic; each reply starts within about 3 s.
- [ ] Dashboard ticks: ₹1,340 before answer, WhatsApp bubble after line 1, ₹2,300 about 25 s later, ₹50,000 after line 2, Approve button works.
- [ ] Call ends on its own after the goodbye.
- [ ] Run it once in Kannada.
- [ ] Run `npm run record-demo` once and keep the WAV.
- [ ] Phone path (only if Twilio is set up): `ngrok http 3000`, put the https URL in `PUBLIC_BASE_URL`, restart, then `curl -X POST localhost:3000/twilio/call -H 'content-type: application/json' -d '{"merchantId":"m001"}'`. The judge's number must be verified in the Twilio trial console. Twilio trial calls start with a short Twilio notice before Saathi speaks.
- [ ] Charger, HDMI adapter, hotspot as backup, volume at 80 percent.

## Numbers judges may ask about

- Yesterday ₹14,200 is pinned in the seed; the rest of the 30-day history is generated deterministically (seed 20261031).
- Loan limit is 15 percent of the last 30 days' digital takings, rounded to ₹10,000, capped at ₹2,00,000; eligibility needs score ≥ 680, 6+ months on Paytm, no existing loan.
- Calling hours 09:00 to 21:00 IST are stricter than TRAI's 21:00 to 09:00 quiet period on purpose: one rule for every action.
- Human approval is mandatory above ₹25,000.
- Latency on 30 Oct over home Wi-Fi: STT 135 to 285 ms, LLM 490 to 1,390 ms (2 to 4 calls per turn), TTS to first audio 0.8 to 1.8 s, total 2.0 to 3.2 s per turn. The opening is prepared while the phone rings.
