# Saathi: the final one-click demo

Finals, 31 Oct 2026, Paytm Bellandur. One laptop, one projector, one judge with a phone. Submission window about 17:00 IST; the demo video is a required deliverable.

The whole scene starts from one button. You talk; the agents work; the judge answers the phone.

## Where it lives

- Home: **https://saathi.deepcycle.app/fleet**
- On the venue laptop, open it once as **https://saathi.deepcycle.app/fleet?key=<DEMO_CONTROL_KEY from .env>**. That unlocks the controls in this browser. Do not show this URL on the projector.
- Header: merchant picker (**Ravi · हिंदी**, **Lakshmi · ಕನ್ನಡ**, **Thomas · English**) and **▶ Start demo**.

## What happens after one click

1. You pick the merchant and click **▶ Start demo**.
2. The merchant's tile on the fleet goes red. The agent lanes light up one after another.
3. **Diagnoser** sees payments landing with no Soundbox announcement (about 8 s).
4. **Fixer** restarts the Soundbox.
5. **Compliance** logs its checks.
6. **Manager** escalates and auto-dials the phone number in the dashboard strip (default: Amit's phone).
7. The page follows to the merchant dashboard while the phone rings.
8. The call is turn-based over Twilio with Sarvam voice. The judge answers in short words.
9. The udhaar reminder goes to real WhatsApp.
10. Saathi offers the loan and reads the KFS. The gates fill. A human clicks **Approve**, then **Disburse** (hand-off only, no money moves).
11. **← Back to fleet** shows the lane history and the scoreboard.

## 1. Timing: 4 minutes 30 seconds, hard cuts

| Clock | Beat | On screen | Hard cut |
|---|---|---|---|
| 0:00 | Opening twenty seconds (below) | Fleet, all tiles green, scoreboard | Click **▶ Start demo** at 0:20 at the latest |
| 0:20 | Lanes light up. One line per agent (section 3) | Red tile, Diagnoser, Fixer, Compliance, Manager lanes | Stop talking when the phone rings |
| 0:45 | Phone rings. Judge answers on speaker | Page has moved to Ravi's dashboard | If no ring by 0:55, go to fallback 2 |
| 0:50 | Call: disclosure, Soundbox fix, reminder ask | Transcript, Recovered ticks | |
| 1:20 | Judge: "haan bhejo". WhatsApp arrives | WhatsApp bubble, "sent via WhatsApp" | Hold the phone up, 5 s only |
| 1:35 | Loan offer and KFS. Judge: "haan loan chahiye" | Gates panel filling, Offered ticks | |
| 2:15 | Gates walk-through. Click **Approve**, then **Disburse** | Gates, hand-off line in the log | Never cut this |
| 2:45 | Saathi says goodbye and ends the call | Call pill goes idle | If the call is still going at 3:00, judge says "theek hai, dhanyavaad" |
| 3:00 | Click **← Back to fleet** | Lane history, scoreboard | |
| 3:10 | Impact and model (40 s) | Scoreboard | Cut to one sentence if behind |
| 3:50 | Second language run (60 s), only if the clock shows 3:50 or earlier (section 4) | Fleet, new merchant | Skip if behind |
| 4:10 | Close and ask (20 s) | Scoreboard | |
| 4:30 | Stop talking | | |

If behind: drop the second language run first, then shorten impact to one sentence. Never cut the gates.

## 2. The opening twenty seconds (say it exactly)

"This is Saathi, an autonomous service and sales teammate for Paytm. It resolves a merchant's problem before a ticket exists, and it closes a first-time loan with a human on the money step. That is Track 3."

Point at the fleet. "These are merchants Saathi watches. All green. Ravi runs a kirana in Jayanagar. Watch what happens when his Soundbox goes quiet."

Click **▶ Start demo**. Hand the phone to the judge. "Ravi, keep this phone. It will ring."

## 3. What to say while each lane lights up

One line per agent. Say it as the lane lights, not before.

- **Diagnoser:** "Diagnoser sees payments landing in the app with no Soundbox announcement. Customers think the payment failed."
- **Fixer:** "Fixer restarts the Soundbox. No ticket, no helpline call."
- **Compliance:** "Compliance checks consent, AI disclosure and the 9 to 7 calling window before anyone is called."
- **Manager:** "Manager escalates to the merchant and dials his phone. There it goes."

Then stop. Let the phone ring.

## 4. Three-language plan

**Run 1, Hindi, full (Ravi).** The whole flow above.

Judge lines, short:
- To the reminder question: **"haan bhejo"** (or "haan").
- To the loan: **"haan loan chahiye"**.
- To end: **"theek hai, dhanyavaad"**.

What Saathi says, so you know where you are: AI disclosure first; Soundbox silent, 8 payments worth about ₹1,690 landed unannounced during the demo, restarted, all confirmed; yesterday ₹14,200; Suresh owes ₹2,300 for 12 days, send a reminder? Then the loan: ₹50,000, Diwali in 8 days, 6 months at 18 percent, about ₹9,080 a month, partner NBFC, 1-day cooling-off.

**Run 2, 60 seconds, only if time allows.** On **← Back to fleet**, pick **Lakshmi · ಕನ್ನಡ** or **Thomas · English** and click **▶ Start demo** again.

Say: "Same agents, another merchant, another language." Let one exchange play, then end it.

- Kannada (Lakshmi, Basavanagudi; Soundbox silent, 8 payments about ₹1,690 unannounced, restarted; Manjunath owes ₹1,800; loan ₹30,000): **"houdu"** to each question, **"sari, dhanyavaadagalu"** to end.
- English (Thomas): **"yes, send it"**, then **"yes"**, then "okay, thank you".

Cut run 2 at 60 s even mid-call. Say: "It finishes the same way: gates, human approval." Go to the close.

## Impact and close (what you say after Back to fleet)

**Impact (40 s):** "Every rupee on this scoreboard was a tool result, checked by the number audit in the log. Tickets deflected, udhaar recovered, first-time borrowers against a 7 percent base. Model: ₹30 to 50 a month on the Soundbox subscription. Cost: ₹3 to 5 per call."

**Close (20 s):** "Other voice bots wait for questions. Saathi hunts for lost money and acts, and it asks a human before the money step. Built solo, repo and tests ready to hand to a Paytm team. I would like the mentor conversation."

## 5. Pre-flight checklist (30 minutes before, then again 5 minutes before)

- [ ] Laptop on power. Hotspot on and connected as backup. `curl -s https://saathi.deepcycle.app/fleet >/dev/null && echo ok`.
- [ ] Open `https://saathi.deepcycle.app/fleet?key=<DEMO_CONTROL_KEY from .env>` once on the venue laptop. The merchant picker and **▶ Start demo** are visible.
- [ ] Open any merchant dashboard and click **Reset scene**. Back on the fleet: all tiles green, counters at ₹0.
- [ ] Phone number in the dashboard strip is the phone the judge will hold (default Amit's). Change it in **Merchant phone** if a judge's own phone is used.
- [ ] That phone: ringer and media volume at maximum, not on silent, no Do Not Disturb, speaker mode ready.
- [ ] WhatsApp: the receiving phone has sent **join plenty-drive** to **+1 415 523 8886** today. Click **Send test WhatsApp** once and see it arrive.
- [ ] Clock check: calling window is 9 AM to 7 PM IST. Outside it, compliance refuses the call. That is correct, but not on stage.
- [ ] Projector: browser full screen, zoom 110 to 125 percent if the hall is deep.
- [ ] One full dry run. Then **Reset scene** again so the counters start at zero.
- [ ] Offline fallback ready in a terminal (not run yet): `npm run demo:offline`.
- [ ] Recorded video file open in QuickTime, paused on frame one.
- [ ] Charger, HDMI adapter.

## 6. Recording plan for the demo video

Record one clean Hindi run before the finals. It doubles as the last fallback.

**Option A, screen recorder (preferred, gets voice and narration).** QuickTime: File > New Screen Recording, microphone on, record the full screen. Put the phone on speaker next to the laptop mic so Saathi's voice is captured.

**Option B, scripted.** With a local server running (`npm run demo` or `npm run demo:offline`), put the dashboard full screen and run `bash scripts/record-video.sh` (Hindi) or `bash scripts/record-video.sh m002` (Kannada). It writes `recordings/demo-<stamp>-<merchant>.mov` plus the WAV. `screencapture` does not record system audio, so join the WAV in QuickTime or iMovie. The terminal needs Screen Recording permission.

Sequence to capture (aim for 3 to 4 minutes):

1. Fleet, all green, 3 s. Voice the opening twenty seconds.
2. Click **▶ Start demo**. Hold on the red tile and the four lanes lighting up.
3. Page moves to Ravi's dashboard. Phone rings (show it, or cut to a phone shot).
4. The call: disclosure, Soundbox fix, "haan bhejo".
5. WhatsApp arriving on the phone (hold it to the camera or use a phone screen recording).
6. Loan, KFS, "haan loan chahiye". Hold on the gates panel filling.
7. Click **Approve**, then **Disburse**. Hold on the hand-off log line.
8. Goodbye, call ends.
9. **← Back to fleet**: lane history and scoreboard. Voice the close.
10. Optional: 20 s of the Kannada or English run.

Save it as `recordings/final-demo.mov`. Check it plays, with sound, before you leave for the stage.

## 7. Fallback ladder, in order

Decide in five seconds. Do not debug on stage.

1. **Live phone.** One-click flow, Twilio call, real WhatsApp.
2. **Browser call screen.** If the phone does not ring by 0:55: on the dashboard click **Open laptop call screen**, click once for audio, allow the mic, the judge speaks into the laptop. The text box sends a typed line through the same agent if the room is loud.
3. **Offline.** No internet or Sarvam down: `npm run demo:offline` on the laptop, open `http://localhost:3000/fleet`, same tools and dashboard, scripted brain and cached audio. Offline opens with the leaks already there (Ravi's Soundbox down since 18:02), so say "this happened overnight" instead of clicking Start demo. Judge lines typed, or `npm run record-demo`.
4. **Recorded video.** Play `recordings/final-demo.mov` and talk over it.

## If the judge goes off script

The agent is live, not a recording. It handles "no" (skips the reminder, still offers the loan; declines gracefully). It answers questions it has data for (yesterday's count, other udhaar names, the device). It says honestly when it has no data. If the line picks up noise, Saathi asks them to repeat. On the phone, the judge should pause about a second after speaking and not talk over Saathi.

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
| Kannada ASR in a noisy shop | Vocabulary is ledger names and amounts, every number is confirmed back, and the fallback is a typed line or WhatsApp. |
| P2P collect is banned, how do they pay | Saathi never sends collect requests. The link is the merchant's verified P2M pay intent with MCC; it says so on the bubble. |
| Is the call scripted | No. Saathi decides which tools to call. The lanes on the fleet are the tool calls, in order, with their role. |
| You are one person | Built solo; the repo has tests, an audit log and a hand-over README written for a Paytm team on Monday. Hiring is a listed outcome; I want that conversation. |
| Why Track 3 and not Track 1 | It resolves a support ticket before it exists and closes a loan sale with a human on the money step: sales or customer service, takes actions, escalates to humans. |

Numbers you may quote as fact: 1.64 crore Soundboxes and 5.2 crore registered merchants (Paytm Q2 FY27); about 7 percent of subscription merchants have a loan and over half of disbursements are repeats; financial-services distribution ₹912 crore a quarter, up 49 percent. Say "vendor surveys put it at roughly" before any udhaar-loss figure.

## Numbers judges may ask about

- Yesterday ₹14,200 is pinned in the seed; the rest of the 30-day history is generated deterministically (seed 20261031).
- Loan limit is 15 percent of the last 30 days' digital takings, rounded to ₹10,000, capped at ₹2,00,000. Eligibility needs score 680 or more, 6+ months on Paytm, no existing loan.
- Calling window 9 AM to 7 PM IST on screen, stricter than TRAI's quiet period on purpose: one rule for every action.
- Human approval is mandatory above ₹25,000. Disburse only hands the file to the lending partner (sandbox); no funds move.
- Latency on 30 Oct over home Wi-Fi: STT 135 to 285 ms, LLM 490 to 1,390 ms (2 to 4 calls per turn), TTS to first audio 0.8 to 1.8 s, total 2.0 to 3.2 s per turn. The opening is prepared while the phone rings.
