# Paytm Build for India AI Hackathon 2026 — tracks, judging, finals format, earlier-edition winners

Research date: 31 Oct 2026 (the Bengaluru devSemble finals day itself). Legend: **[Confirmed]** = read directly on a primary page; **[Snippet]** = seen only in a search-result snippet of a page I could not open (LinkedIn/X return 999/402); **[Inferred]** = my reasoning.

Important framing finding: the "Paytm Build for India AI Hackathon" in 2026 is not one series but several partner-platform runs under the same brand, each with its own prizes, partners and (sometimes) track names:

| Run | Platform / partners | City | Finals date | Status |
|---|---|---|---|---|
| Mar 2026 | NAMESPACE (+Luma page) | Bengaluru (Paytm office, Bellandur) | 21 Mar 2026 | done, no public winner list found |
| Aug 2026 | HackCulture + Logitech + KnackLabs; Sarvam AI partner | Hyderabad | 22 Aug 2026 | done, winners not named publicly |
| Sep–Oct 2026 | Hackbriven (+ n8n, Sarvam, Cognee, Mochatrade) | Delhi/Noida (19 Sep), Bengaluru (~Sep), Mumbai (3 Oct) | | Mumbai winner public: "Paytm Saathi – Money SOS" |
| Oct 2026 | devSemble; Sarvam AI official AI partner | Delhi/Noida, Bengaluru, Mumbai | **all three on 31 Oct 2026** | finals today; no results yet |

So for the devSemble series there is **no earlier city edition with published results** — all three cities hold finals the same day. The best analogues are the Hackbriven Mumbai winner and the Hyderabad standout.

## Q1. What are the tracks, what is Track 3, and what problem statements did Paytm publish?

### Takeaway
The devSemble (Oct 2026) editions publish exactly three tracks: Track 1 Merchant Growth AI, Track 2 AI-Powered Financial Journeys (insurance, lending, fintech), Track 3 Autonomous AI Teammates (end-to-end sales/customer-service agents). There are no finer-grained problem statements than the three track briefs.

### Cited Findings
- Track 1 brief (verbatim): "Merchant Growth AI — Build the AI business partner for every Paytm merchant. Build scalable AI-led solutions that help Paytm merchants grow their business, manage operations, and serve customers better. Think beyond payments, identify opportunities where AI can become a trusted business copilot for millions of merchants." **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- Track 2 brief (verbatim): "AI-Powered Financial Journeys — Make Insurance, Lending and Fintech simpler, faster and more human. Reimagine customer-facing journeys across Insurance, Lending and Fintech using AI. Focus on removing friction, reducing complexity, and helping customers complete critical financial journeys faster and with greater confidence." **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- Track 3 brief (verbatim): "Autonomous AI Teammates — Build AI teammates that don't just respond; they get the job done. Design an AI teammate that can go beyond answering questions and deliver measurable outcomes in sales or customer service. The AI should understand context, make decisions, take actions, and work alongside human teams." **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- The "Problem Statements" section of the page lists only the three track names (1. Merchant Growth AI, 2. AI-Powered Financial Journeys, 3. Autonomous AI Teammates); no sub-problems. **[Confirmed]** — same page.
- A search snippet of the devSemble page adds to Track 3: "How might we build an AI teammate that can independently handle a customer-service or sales workflow end-to-end - resolving issues, taking actions across systems, and escalating to humans only when needed?" and "Difficulty: Medium". **[Snippet]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm) (not visible in the rendered main text I read; probably inside the Problems tab).
- The Delhi devSemble page carries identical track text; venue Paytm, SkymarkOne, Sector 98, Noida. **[Confirmed]** — [devSemble Delhi page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-delhi-by-paytm)
- Earlier (Mar/May/Aug) runs used two broader tracks: "AI for Paytm Users" and "AI for Small Businesses". **[Confirmed]** — [Luma page](https://luma.com/evm2zg68) (March edition), [Paytm X post 28 May 2026](https://x.com/Paytm/status/2059961106005909840) ("Come solve real fintech problems for: 1 Paytm users. 2 Small businesses across India"). Hyderabad listing adds "FinTech, Customer Engagement, Payments" and focus areas "Personalization, trust, payments, business operations, and customer engagement". **[Confirmed]** — [hiretoday listing](https://hiretoday.in/competitiondetails/40000147), [hackathons.space](https://www.hackathons.space/hackathons/build-for-india-ai-hackathon-hyderabad-edition)
- A GitHub repo built for Hackbriven's Bengaluru run (features verified 18–19 Sep 2026) also uses "Track 3 — Autonomous AI Teammates", so the three-track structure predates devSemble. **[Confirmed]** — [Nishchint repo](https://github.com/ShwetaThakur702/hackathon_pt)

### Inferences
- Track 3 is explicitly about *action-taking* agents ("measurable outcomes in sales or customer service", "take actions", "work alongside human teams"), not chat assistants. Nearly every public Track 3 repo converges on the same architecture — LLM intent → deterministic policy engine → sandboxed action → audit log → human escalation — so judges will have seen that pattern many times; differentiation must come from the outcome metric and the demo, not the architecture. **[Inferred]**
- A consumer insurance-claims product (ClaimSaathi-style) sits most naturally in Track 2; a "Saathi" that *executes* the claim/grievance and only escalates to a human would also satisfy the Track 3 brief. **[Inferred]**

### Gaps
- No Paytm-published sub-problem statements, datasets, or APIs exist publicly for any track. Several repos note that Paytm rails were mocked/synthetic (Resolv, Munim AI, MITRA, Commerce OS), implying no sandbox API was provided.

## Q2. Judging criteria/weights and PPT guideline slides

### Takeaway
devSemble publishes the mandatory seven-section Stage-1 deck but explicitly withholds the finals evaluation criteria ("will be communicated to the shortlisted teams"). The only published rubric anywhere in the 2026 series is the Hyderabad HackCulture one (Innovation, Technical Implementation, Originality, Problem Solving, Presentation — unweighted).

### Cited Findings
- PPT Guidelines (verbatim): "Your presentation should be prepared based on your selected track and must include the following: Title Slide; Problem Statement; Proposed Solution; Technology/Tech Stack Used; USP (Unique Selling Proposition); Impact & Benefits; Business Model. Once your PPT is ready, please upload it in the below form before the submission deadline." Stage 1 window 18 Oct 2026 00:00 → deadline 28 Oct 2026 14:00; registration closes 27 Oct 2026. **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- Stage 2 (verbatim): "Teams shortlisted from Stage 1 will be invited to participate in the offline hackathon on 31st October 2026 at the designated venue. During the hackathon, participants will work on bringing their proposed ideas to life by developing a working prototype or proof of concept. Teams will have access to mentors during the build and the opportunity to demonstrate their solutions and explain their approach during the evaluation process. The finalists will submit the prototype, a demo video and the presentation of the prototype built for final evaluation. Further details regarding reporting time, event guidelines, and evaluation criteria will be communicated to the shortlisted teams." **[Confirmed]** — same page.
- Hyderabad (HackCulture) judging criteria: "Innovation, Technical Implementation, Originality, Problem Solving, Presentation"; no weights. Team size 1–2. Allowed tools: "Paytm AI Ecosystem, open source libraries, public development tools". **[Confirmed]** — [hiretoday listing](https://hiretoday.in/competitiondetails/40000147)
- Participant repos independently confirm the same seven-slide checklist as the Round-1 organizer checklist (HarvestWise: "Title Slide, Problem Statement, Proposed Solution, Tech Stack, USP, Impact & Benefits, Business Model", PDF submission). **[Confirmed]** — [HarvestWise repo](https://github.com/venkatanarayana15/paytm-harvestwise); ClaimSaathi added Product and Team slides for nine total — [ClaimSaathi repo](https://github.com/ParasAdlakha/claimsaathi); Claim Sach submitted an eleven-slide deck plus an appendix of proof — [Claim Sach repo](https://github.com/Pushkarmondal/paytm-hackathon)
- Earlier (Mar 2026) Luma edition: team size 1–3, invite-only shortlisting, finals-day deliverable was a demo presentation. **[Confirmed]** — [Luma page](https://luma.com/evm2zg68), [NAMESPACE substack](https://namespaceworld.substack.com/p/hottest-updates-paytm-ai-fintech)

### Inferences
- Because "Impact & Benefits" and "Business Model" are mandatory deck sections, commercial viability is evidently part of what Paytm screens for even at Stage 1 — unusual for a one-day hackathon and consistent with the Mumbai winner's teammate being praised for "bringing a strong business vision". **[Inferred]**
- The finals deliverable is three artefacts (prototype + demo video + presentation), so a pre-recorded fallback demo video is worth preparing in case live demos fail. **[Inferred]**

### Gaps
- Finals rubric and weights for the devSemble editions are not public; they were sent privately to shortlisted teams. Pitch length and Q&A duration are not published anywhere I could access.

## Q3. Judges and mentors; what they publicly care about

### Takeaway
No judge or mentor list has been published for the devSemble Bengaluru finals. The only named 2026 jury is the Hackbriven Mumbai one (three Paytm leaders from Service & Assisted Sales, AI Sales and Engineering), and the only named mentor commentary is from Dev Aggarwal (Gooey.AI) at Hyderabad.

### Cited Findings
- Mumbai (Hackbriven, 3 Oct 2026) jury: Ami Ganjawalla – Vice President, Service & Assisted Sales, Paytm; Cyrus Carvalho – AI Sales Director, Paytm; Prasad Nayak – Engineering Manager, Paytm. **[Snippet]** — LinkedIn posts by the winners, surfaced via [Pratik Shah's LinkedIn activity](https://www.linkedin.com/in/pratik-shah22/), [Nikhil Kagwade](https://www.linkedin.com/in/nikhil-kagwade-9aa89a137/), [Tejas Bavaskar](https://www.linkedin.com/in/tejas-bavaskar-658238104/) (pages return HTTP 999; text seen only in search snippets).
- Hyderabad mentor Dev Aggarwal (Founder & CTO, Gooey.AI): "One project that stood out to me - Vaishnavi Chada & Surohita Snigdha Satrasala built a tax copilot that auto files your taxes from the paytm app. Wish every bank auto files my taxes with AI!" **[Snippet]** — [Dev Aggarwal LinkedIn](https://www.linkedin.com/in/devxpy/)
- Hyderabad organiser Sachin Pandey (HackCulture) thanked "all our mentors, judges and the Paytm team" and "Sarvam, Logitech and HackCulture" without naming them. **[Snippet]** — via [HackCulture X](https://x.com/Hack_Culture/status/2089736358491488334) search results.
- devSemble pages promise "mentors during the build" and that winners "showcase your skills to industry teams" with "Hiring Opportunities" listed as Paytm's partner perk; Sarvam AI is "Official AI Partner". **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- The March Luma edition promised winners would "showcase their work to Paytm leadership". **[Confirmed]** — [Luma page](https://luma.com/evm2zg68)

### Inferences
- A jury drawn from Service/Assisted Sales, AI Sales and Engineering (as in Mumbai) will weigh (a) does it reduce support load or close sales, (b) is it something Paytm's sales/assisted channels could deploy, (c) is it technically real. A consumer claims helper should therefore be framed as reducing Paytm Insurance support tickets / increasing policy attach and renewal, not just as user benefit. **[Inferred]**
- Hiring is an explicit outcome of the series, so judges likely also assess the builders (clarity, engineering depth) — a well-tested, honestly scoped repo matters. **[Inferred]**

### Gaps
- No Bengaluru devSemble judge or mentor names found; no Sarvam AI personnel named as judges anywhere. No Sarvam blog post about the partnership was found (Sarvam's own posts concern its separate "BuildIn' Hours" hackathon, 9 Aug 2026).

## Q4. Which projects won or placed in earlier 2026 editions, and what pattern?

### Takeaway
The only publicly confirmed 2026 winner is Team Swamit Labs (Mumbai, Hackbriven, 3 Oct 2026) with "Paytm Saathi – Money SOS": a voice-first, any-language insurance-plus-lending emergency assistant that reads the policy and bill, computes the real coverage gap, compares options and executes the approved plan. The Hyderabad standout was a tax copilot that auto-files taxes from the Paytm app. The pattern: multilingual/voice, agentic (executes not just advises), trust-explicit ("the AI explains; the customer decides"), and framed around a vivid human moment.

### Cited Findings
- Mumbai winner: "6,000 registrations. 100 teams in the offline finale. 10 on stage. 1 winner and it was us. Team Swamit Labs won the Paytm Build for India AI Hackathon - Mumbai Edition." Team: Sumit Pawar and Swateja Bagal. **[Snippet]** — LinkedIn posts via [Pratik Shah](https://www.linkedin.com/in/pratik-shah22/), [Kajal Patil](https://www.linkedin.com/in/kajal-patil-610b4a1a9/), [Sharath Saju](https://www.linkedin.com/in/sharath-saju-a78261241/)
- Winning idea: "Paytm Saathi - Money SOS: one button for any money emergency. You say what happened, in any language, and the AI reads your policy and bill, works out the real gap, compares your options, and carries out the plan you approve, start to finish." Pitch scenario: "11:40 PM. A father in the ICU. A hospital asking for an ₹80,000 deposit right now." Problem framing: people panic and borrow the full amount when insurance would have covered most of it. Principle: "In fintech, trust is the product. The AI explains; the customer decides." **[Snippet]** — same LinkedIn sources.
- Swateja Bagal credited Sumit Pawar for "bringing a strong business vision and turning our technical idea into real business value". **[Snippet]** — same sources.
- Mumbai Hackbriven edition partners: Paytm with Hackbriven, Mochatrade, n8n, Sarvam, Cognee; 3 Oct 2026 at Paytm Office Mumbai. **[Snippet]** — [Hackbriven Mumbai page](https://hackbriven.com/event/paytm-build-for-india-ai-hackathon-mumbai-edition) (page content loads client-side; details from search snippet only).
- Hyderabad (22 Aug 2026): prize pool ₹40,000 + Paytm interview opportunities + Logitech gadgets worth ₹5,000 each for top participants; ₹5K Sarvam credits for winners; 500 Sarvam credits for shortlisted builders. Winners not named publicly. **[Confirmed]** — [hiretoday listing](https://hiretoday.in/competitiondetails/40000147); credits **[Snippet]** — [HackCulture X](https://x.com/Hack_Culture/status/2089736358491488334)
- Hyderabad standout (mentor's view, not confirmed as a winner): tax copilot that auto-files taxes from the Paytm app by Vaishnavi Chada & Surohita Snigdha Satrasala. **[Snippet]** — [Dev Aggarwal LinkedIn](https://www.linkedin.com/in/devxpy/)
- March 2026 Bengaluru (NAMESPACE): ₹1,00,000 prize pool, 1–3 member teams, invite-only; Paytm's post-event X post named no winners. **[Confirmed]** — [Luma page](https://luma.com/evm2zg68); [NAMESPACE substack](https://namespaceworld.substack.com/p/hottest-updates-paytm-ai-fintech); [Paytm X 'Innovation mode: ON'](https://x.com/Paytm/status/2035223637498933478)
- Hackbriven Bengaluru round shortlisted project (Round 1): HarvestWise — Tamil-first voice growth copilot for perishable-goods micro-merchants, Sarvam (Indic voice + LLM) + n8n + Cognee; "Round 1 SHORTLISTED"; stated goal "win the Bengaluru finale"; 83/83 tests. **[Confirmed]** — [HarvestWise repo](https://github.com/venkatanarayana15/paytm-harvestwise)
- Other 2026 series entries (status unknown): DukaanSaathi AI (Track 1; XGBoost/YOLOv8/Monte-Carlo + Sarvam voice) — [repo](https://github.com/Tushar040903/Paytm-Build-for-India-AI-Hackathon); Nishchint (Bengaluru Hackbriven, Track 3; LangGraph + n8n + Cognee + Groq; failed-UPI resolution) — [repo](https://github.com/ShwetaThakur702/hackathon_pt); Paytm Commerce OS (Track 3; Sarvam sarvam-105b/saaras:v3/bulbul:v3 + Cognee + n8n WhatsApp agents) — [repo](https://github.com/AryanPandey17/paytm-ai-hackathon); MITRA (Delhi, Track 3; Gemini + digital-twin merchant) — [repo](https://github.com/AmitNIET159/mitra-autonomous-ai); Resolv (Track 3; failed-UPI refunds, policy-gated sandbox, human queue) — [repo](https://github.com/Swastik2201/PAYTM_hackathon_2026).

### Inferences
- The Mumbai winner is thematically almost identical to the user's "Saathi" concept (health-insurance emergency, read policy + bill, compute gap, multilingual, agentic execution). This is a double-edged signal: judges at Paytm have already rewarded this theme once, so it is validated — but the Bengaluru jury (if briefed on Mumbai) may expect something beyond "Money SOS". Differentiators that worked: a single emotionally vivid scenario, an explicit trust principle, execution end-to-end, plus a clear business-value story. **[Inferred]**
- Across all public entries the dominant stack is Sarvam (Indic ASR/TTS/LLM) + deterministic rules + mocked Paytm rails; voice/vernacular is table stakes, not a differentiator. **[Inferred]**
- No fraud-detection or pure-lending winners surfaced; insurance + emergency-credit and merchant-growth copilots dominate. **[Inferred]**

### Gaps
- No published winner lists for the March Bengaluru, Hyderabad, Hackbriven Delhi (19 Sep) or Hackbriven Bengaluru editions. Mumbai 2nd/3rd place not found. The Mumbai winner's repo (github.com/swatejaab/Paytm_sathi) is intentionally stripped ("documentation only"), so its tech stack is unknown.

## Q5. Finals-day format: live demo, pitch length, Q&A, build time

### Takeaway
Confirmed: a one-day offline build at the Paytm office (Bellandur, Bengaluru) on Sat 31 Oct 2026, 9:30 AM–7:00 PM, with mentors, ending in evaluation of a prototype + demo video + presentation. Pitch length and Q&A format are not public; the March edition agenda (≈7 h build, 1 h submission, 2 h demos + awards) is the closest template.

### Cited Findings
- Finals: Saturday 31 October 2026, 9:30 AM to 7:00 PM, Paytm office Bengaluru, shortlisted teams only. **[Confirmed]** — [ClaimSaathi README](https://github.com/ParasAdlakha/claimsaathi) (participant's record of the invite); venue "Paytm, 1st Floor, B Wing, The Hub, Infront of Bellandur Police Station, Sarjapur Main Road, Bellandur" and "Hackathon Starts 31/10/2026, Ends 31/10/2026" **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- Deliverables at finals: "the prototype, a demo video and the presentation of the prototype built"; mentors available during the build; teams "demonstrate their solutions and explain their approach during the evaluation process". **[Confirmed]** — same page.
- March 2026 Bengaluru agenda (same venue, same organiser team): 8:30–9:30 registration/breakfast; 9:30 kickoff; 10:00–13:00 hack; 13:00–13:30 lunch; 13:30–17:00 hack; 17:00–18:00 submissions; 18:00–20:00 demo presentations and awards. **[Confirmed]** — [Luma page](https://luma.com/evm2zg68)
- Mumbai (Hackbriven): "100 teams in the offline finale. 10 on stage." i.e., a cut from offline build to a top-10 stage pitch. Duration "8 Hours" for the devSemble Mumbai edition. **[Snippet]** — LinkedIn winner posts; devSemble Mumbai search snippet.
- Sarvam prizes: ₹5,000 Sarvam AI credits for each of the top 3 teams in every city; 500 credits for every participant who builds with Sarvam. Cash prizes: devSemble pages say only "exciting prizes, rewards, and recognition". **[Confirmed]** — [devSemble Bengaluru page](https://devsemble.com/hackathons/paytm-build-for-india-ai-hackathon-bengaluru-by-paytm)
- Interest metric: Bengaluru devSemble page 11,576 views; Delhi 23,846 views. **[Confirmed]** — devSemble pages.

### Inferences
- Expect roughly 7 hours of build, then a short pitch (the Mumbai "10 on stage" model suggests a shortlist cut before stage pitches). With "top 3 teams in every city" receiving Sarvam credits, the podium is likely three deep. **[Inferred]**
- Using Sarvam AI visibly in the build is cheap insurance (credits for all Sarvam builders; official AI partner on the jury's radar). **[Inferred]**

### Gaps
- Pitch minutes, Q&A length, judge count, whether the Stage-1 deck is re-presented or a new one, and the cash prize amounts for devSemble editions are all unpublished.

## Q6. Bengaluru-round participant repos and posts — what competitors are building

### Takeaway
Public Bengaluru (devSemble) repos show Track 2 crowded with health-insurance claim assistants (at least five "ClaimSaathi"-named projects plus "Claim Sach"), and Tracks 1/3 full of voice-first merchant copilots with deterministic guardrails and causal ROI measurement.

### Cited Findings
- ClaimSaathi (Paras & Harshita Adlakha, Bengaluru devSemble, Track 2): reads itemised hospital bill, predicts payout with a policy clause per deduction, lists missing documents/deadlines, pre-fills claim form Part A, checks settlement letters and drafts grievance letters, Hindi/English voice via Web Speech API; Node 22 stateless server, BM25 retrieval, deterministic rules engine for money, OpenAI gpt-5-mini for vision/grounded answers; GitHub Pages demo; 2-min demo + 3-min pitch video + 9-slide deck; Paytm integration (pre-filled policy/KYC/bank, medical EMI for the gap) is roadmap only; no Sarvam usage. **[Confirmed]** — [ClaimSaathi repo](https://github.com/ParasAdlakha/claimsaathi); co-author notes some stats come from news reports of IRDAI data rather than primary reports — [HarshitaAdlakha fork](https://github.com/HarshitaAdlakha/claimsaathi); portfolio says it was one of "five hackathons in one week" — [harshitaadlakha.github.io](https://harshitaadlakha.github.io/)
- Other same-name Track 2 entries: Team Static (Siddhartha Jaiswal, Suman Kumar Jha) — Claim Readiness, Rejection Decoder, Appeal Builder — [S-jais/ClaimSaathi](https://github.com/S-jais/ClaimSaathi); [Bhavya2354/claimsaathi](https://github.com/Bhavya2354/claimsaathi) (bill check, admission estimate, appeal letters, policy Q&A); [IqraS-gif/ClaimSaathi](https://github.com/IqraS-gif/ClaimSaathi) (React/FastAPI/MongoDB/Google Document AI). **[Confirmed via search listing]**
- Claim Sach (Pushkarmondal; deck "for devSemble"): "evidence-backed, interactive health-insurance coverage simulator" with a "Coverage Twin" that turns policy terms into rules and shows deductions with source clause; Next.js/TypeScript/Zod; 11-slide deck + appendix. **[Confirmed]** — [Claim Sach repo](https://github.com/Pushkarmondal/paytm-hackathon)
- VyaparVoice (Team SemiTechnical, Kevin Joseph; Bengaluru, Track 1): RFM segmentation over UPI data, WhatsApp restock orders, Kannada/Hindi/English Soundbox briefings, five deterministic guardrails, 80/20 holdout causal ROI (claims 5.8x ROI on a seeded demo ledger); FastAPI/SQLite; optional Sarvam/Groq. **[Confirmed]** — [VyaparVoice repo](https://github.com/somebeing2/paytmai-vyaparvoice)
- Paytm Business Autopilot (HZio52; Bengaluru 2026; Tracks 1 & 3): voice-first "one action per evening" agent in English/Hindi/Kannada, Detect→Calculate→Ask→Measure loop, measured against a control group, consent/quiet-hours controls, audit log. **[Confirmed]** — [repo](https://github.com/HZio52/paytm-business-autopilot-poc)
- "Paytm Saathi" merchant-retention workflow (imsayon; Bengaluru edition) — name collision with the user's project. **[Snippet]** — [imsayon/paytm-saathi](https://github.com/imsayon/paytm-saathi)
- Delhi edition Track 1 entry "MunshiJi" (Team Neural Wave). **[Snippet]** — [NAME-ASHWANIYADAV/paytm](https://github.com/NAME-ASHWANIYADAV/paytm)

### Inferences
- "Saathi"-branded insurance-claim helpers are the single most crowded idea in Track 2 for Bengaluru; the devSemble shortlist likely contains several. Winning would require a sharper wedge than "read bill, explain deductions, draft grievance" — e.g., executing the claim end-to-end inside Paytm rails, a quantified Paytm business case (support deflection, EMI/lending attach), or an evaluation showing accuracy on real policy wordings. **[Inferred]**
- Competitors are explicitly pre-empting judge scepticism about simulated numbers (VyaparVoice lists caveats; Autopilot/MITRA flag synthetic data). Honest scoping is the norm; over-claiming would stand out negatively. **[Inferred]**

### Gaps
- No LinkedIn/X posts from Bengaluru devSemble shortlisted teams were found (finals are today; posts will follow). No public shortlist count for Bengaluru.
