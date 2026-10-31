// Saathi pitch deck, Paytm Build for India AI Hackathon, Bengaluru finals, 31 Oct 2026.
// Track 3: Autonomous AI Teammates.
// Usage: cd deck-src && npm install && node build.js
// Writes ../deck/Saathi_Pitch_Track3.pptx and, when LibreOffice is installed, ../deck/Saathi_Pitch_Track3.pdf.

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

// Palette: deep ink navy dominant, electric cyan accent, warm saffron spark
const INK = "0A1A33";
const INK2 = "13294D";
const INK3 = "1C3661";
const CYAN = "00B4E6";
const CYAN_DK = "0089B3";
const SAFFRON = "FFA62B";
const WHITE = "FFFFFF";
const MIST = "EEF4FA";
const MIST2 = "DCE6F2";
const SLATE = "4A5B73";
const GREY = "8A97A8";
const PALE = "C9D6E8";
const HEAD = "Arial";
const BODY = "Calibri";

const OUT_DIR = path.join(__dirname, "..", "deck");
const OUT_PPTX = path.join(OUT_DIR, "Saathi_Pitch_Track3.pptx");

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: "#" + color, size: String(size) })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// Motif: icon inside a filled circle
async function iconCircle(slide, Comp, x, y, d, bg, fg) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg } });
  const pad = d * 0.26;
  slide.addImage({ data: await icon(Comp, fg), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
}

function title(slide, text, dark = false, size = 34) {
  slide.addText(text, {
    x: 0.6, y: 0.4, w: 12.1, h: 0.8, fontFace: HEAD, fontSize: size, bold: true,
    color: dark ? WHITE : INK, margin: 0, isTextBox: true, valign: "middle",
  });
}

function kicker(slide, text, dark = false) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.15, w: 8, h: 0.3, fontFace: BODY, fontSize: 12, bold: true,
    color: dark ? CYAN : CYAN_DK, charSpacing: 3, margin: 0, isTextBox: true,
  });
}

function footer(slide, n, dark = false) {
  slide.addText(`Saathi  ·  Track 3: Autonomous AI Teammates  ·  ${n}`, {
    x: 0.6, y: 7.0, w: 12.1, h: 0.3, fontFace: BODY, fontSize: 10,
    color: dark ? "8FA3BF" : GREY, align: "right", margin: 0, isTextBox: true,
  });
}

function card(slide, x, y, w, h, fill, line) {
  slide.addShape("roundRect", { x, y, w, h, fill: { color: fill }, line: line || { color: fill }, rectRadius: 0.12 });
}

// Small uppercase tag, used on the tech slide for REAL / SIMULATED / BUILT, NOT LIVE
function tag(slide, text, x, y, bg, fg, w = 1.05) {
  slide.addShape("roundRect", { x, y, w, h: 0.28, fill: { color: bg }, line: { color: bg }, rectRadius: 0.14 });
  slide.addText(text, { x, y, w, h: 0.28, fontFace: BODY, fontSize: 10, bold: true, color: fg, align: "center", valign: "middle", charSpacing: 1, margin: 0, isTextBox: true });
}

function bullets(slide, items, opts) {
  slide.addText(items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < items.length - 1 } })), {
    fontFace: BODY, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 6, ...opts,
  });
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.title = "Saathi: Autonomous service and sales teammate for Paytm merchants";
  pres.author = "Amit Mishra, Team Saathi";
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

  // ---------- 1. Title ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    s.addShape("ellipse", { x: 9.4, y: -1.6, w: 6.0, h: 6.0, fill: { color: INK2 }, line: { color: INK2 } });
    s.addShape("ellipse", { x: 10.6, y: 4.6, w: 4.0, h: 4.0, fill: { color: "0E2443" }, line: { color: "0E2443" } });

    s.addText("PAYTM BUILD FOR INDIA AI HACKATHON · BENGALURU FINALS · 31 OCT 2026", {
      x: 0.8, y: 0.7, w: 9, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: CYAN, charSpacing: 3, margin: 0, isTextBox: true,
    });
    s.addText("Saathi", {
      x: 0.8, y: 1.15, w: 7, h: 1.4, fontFace: HEAD, fontSize: 76, bold: true, color: WHITE, margin: 0, isTextBox: true,
    });
    s.addText("An autonomous service and sales teammate for Paytm merchants.", {
      x: 0.8, y: 2.6, w: 7.3, h: 1.0, fontFace: BODY, fontSize: 26, color: WHITE, margin: 0, isTextBox: true, valign: "top",
    });
    s.addText([
      { text: "Resolves the problem before a ticket exists.", options: { breakLine: true } },
      { text: "Closes a first-time loan with a human on the money step." },
    ], { x: 0.8, y: 3.65, w: 7.3, h: 1.1, fontFace: BODY, fontSize: 20, color: PALE, margin: 0, isTextBox: true, valign: "top", paraSpaceAfter: 4 });

    s.addText([
      { text: "Track 3: ", options: { bold: true, color: SAFFRON } },
      { text: "Autonomous AI Teammates", options: { color: WHITE } },
    ], { x: 0.8, y: 4.95, w: 7.3, h: 0.4, fontFace: BODY, fontSize: 18, margin: 0, isTextBox: true });
    s.addText([
      { text: "Team Saathi  ·  Amit Mishra  ·  built solo", options: { color: WHITE, breakLine: true } },
      { text: "Partner stack: Sarvam AI (saarika, bulbul, sarvam-105b) live in the demo", options: { color: "8FA3BF" } },
    ], { x: 0.8, y: 5.5, w: 7.6, h: 0.9, fontFace: BODY, fontSize: 16, margin: 0, paraSpaceAfter: 4, isTextBox: true, valign: "top" });

    // Scoreboard card: the thing the demo opens on
    const cx = 8.55, cy = 1.35, cw = 4.2, ch = 4.75;
    card(s, cx, cy, cw, ch, INK3);
    s.addText("SAATHI'S SCOREBOARD", { x: cx + 0.3, y: cy + 0.25, w: cw - 0.6, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: CYAN, charSpacing: 3, margin: 0, isTextBox: true });
    s.addText("One merchant, one morning, before he answered the phone", { x: cx + 0.3, y: cy + 0.55, w: cw - 0.6, h: 0.55, fontFace: BODY, fontSize: 14, color: PALE, margin: 0, isTextBox: true, valign: "top" });
    const rows = [
      ["₹1,340", "Recovered", "Soundbox restarted, 7 payments confirmed", fa.FaVolumeUp],
      ["₹2,300", "Collected", "Udhaar reminder on WhatsApp, paid", fa.FaWhatsapp],
      ["₹50,000", "Offered", "Diwali loan, approved by a human", fa.FaUserCheck],
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = cy + 1.25 + i * 1.05;
      await iconCircle(s, rows[i][3], cx + 0.3, y + 0.08, 0.62, i === 2 ? SAFFRON : CYAN, INK);
      s.addText([
        { text: rows[i][0] + "  ", options: { bold: true, fontSize: 24, color: WHITE, fontFace: HEAD } },
        { text: rows[i][1], options: { fontSize: 15, color: i === 2 ? SAFFRON : CYAN, bold: true } },
      ], { x: cx + 1.1, y, w: cw - 1.3, h: 0.45, fontFace: BODY, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(rows[i][2], { x: cx + 1.1, y: y + 0.45, w: cw - 1.3, h: 0.4, fontFace: BODY, fontSize: 13, color: PALE, margin: 0, isTextBox: true, valign: "top" });
    }
    s.addText("Demo data from the 30 Oct rehearsal; merchant backend simulated", { x: cx + 0.3, y: cy + ch - 0.42, w: cw - 0.6, h: 0.3, fontFace: BODY, fontSize: 10, italic: true, color: "8FA3BF", margin: 0, isTextBox: true });
  }

  // ---------- 2. Problem ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Problem");
    title(s, "Tuesday, 6:10 PM, Rajajinagar");

    // Left: the scene
    const lx = 0.6, lw = 6.55;
    const beats = [
      ["6:10 PM", "The Soundbox stops announcing. The light blinks green. Nobody in the shop notices."],
      ["6:50 PM", "₹2,340 has landed in the app, unannounced. Forty minutes of silence at the busiest hour."],
      ["Lost", "Two customers walked out, sure their payment had failed. The owner finds out tomorrow, if at all."],
    ];
    for (let i = 0; i < beats.length; i++) {
      const y = 1.4 + i * 0.95;
      s.addShape("rect", { x: lx, y: y + 0.05, w: 0.08, h: 0.75, fill: { color: i === 2 ? SAFFRON : CYAN }, line: { color: i === 2 ? SAFFRON : CYAN } });
      s.addText(beats[i][0], { x: lx + 0.25, y, w: 1.25, h: 0.85, fontFace: HEAD, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true, valign: "top" });
      s.addText(beats[i][1], { x: lx + 1.5, y, w: lw - 1.5, h: 0.85, fontFace: BODY, fontSize: 16, color: SLATE, margin: 0, isTextBox: true, valign: "top" });
    }
    card(s, lx, 4.3, lw, 2.35, MIST);
    s.addText("Paytm's own support pages say so", { x: lx + 0.3, y: 4.42, w: lw - 0.6, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
    bullets(s, [
      "The Soundbox announces successful payments only, never failed or pending ones.",
      "Settlement SMS: “due to network issues you might not receive” it. Wait two days, then phone the helpline.",
      "Offline device: read the LED colour, reseat the SIM, call 0120-4440440.",
    ], { x: lx + 0.3, y: 4.85, w: lw - 0.6, h: 1.5, fontSize: 14, color: SLATE, paraSpaceAfter: 4 });
    s.addText("business.paytm.com/support  ·  paytm.com/blog/paytm-help", { x: lx + 0.3, y: 6.32, w: lw - 0.6, h: 0.28, fontFace: BODY, fontSize: 10, italic: true, color: GREY, margin: 0, isTextBox: true });

    // Right: three leaks
    const rx = 7.5, rw = 5.2;
    s.addText("Three leaks. Nobody owns them.", { x: rx, y: 1.35, w: rw, h: 0.45, fontFace: HEAD, fontSize: 20, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
    const leaks = [
      [fa.FaVolumeMute, "Silent device", "Payments land but nobody hears them. Customers walk, or pay twice."],
      [fa.FaExchangeAlt, "Stuck settlement", "Money sits in Pending or Failed past T+1. The merchant waits, then queues at the helpline."],
      [fa.FaBookOpen, "Ageing udhaar", "Credit given on trust, written in a notebook, chased in person. The oldest lines are never collected."],
    ];
    for (let i = 0; i < leaks.length; i++) {
      const y = 1.9 + i * 1.6;
      card(s, rx, y, rw, 1.45, i === 2 ? INK : MIST);
      await iconCircle(s, leaks[i][0], rx + 0.25, y + 0.3, 0.85, i === 2 ? SAFFRON : INK, i === 2 ? INK : CYAN);
      s.addText(leaks[i][1], { x: rx + 1.3, y: y + 0.17, w: rw - 1.5, h: 0.42, fontFace: HEAD, fontSize: 17, bold: true, color: i === 2 ? WHITE : INK, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(leaks[i][2], { x: rx + 1.3, y: y + 0.6, w: rw - 1.5, h: 0.8, fontFace: BODY, fontSize: 14, color: i === 2 ? PALE : SLATE, margin: 0, isTextBox: true, valign: "top" });
    }
    s.addText("Support waits for the ticket. The merchant's money has no owner.", {
      x: 0.6, y: 6.68, w: 12.1, h: 0.32, fontFace: BODY, fontSize: 16, italic: true, bold: true, color: CYAN_DK, margin: 0, isTextBox: true, valign: "middle",
    });
    footer(s, 2);
  }

  // ---------- 3. Solution ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Solution");
    title(s, "Triggered by the event, not by a question");
    s.addText("Saathi wakes on the merchant's problem, works it in the merchant's language, and escalates to a human whenever money moves.", {
      x: 0.6, y: 1.2, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 16, color: SLATE, margin: 0, isTextBox: true, valign: "middle",
    });
    const steps = [
      [fa.FaEye, "Watch", "Device silent, settlement stuck, udhaar ageing"],
      [fa.FaSearch, "Diagnose", "Root cause from the data, in rupees at stake"],
      [fa.FaBolt, "Act", "Restart, retry, remind the customer, offer credit"],
      [fa.FaPhoneAlt, "Confirm", "Calls the merchant in Hindi or Kannada; tells, asks, listens"],
      [fa.FaGraduationCap, "Learn", "Every outcome logged with who did it and why it was allowed"],
    ];
    const w = 2.25, gap = 0.2125, y = 1.7;
    for (let i = 0; i < steps.length; i++) {
      const [I, h, b] = steps[i];
      const x = 0.6 + i * (w + gap);
      await iconCircle(s, I, x + (w - 0.9) / 2, y, 0.9, i === 2 ? SAFFRON : INK, i === 2 ? INK : CYAN);
      if (i < steps.length - 1) {
        s.addShape("line", { x: x + (w + 0.9) / 2 + 0.08, y: y + 0.45, w: w + gap - 1.06, h: 0, line: { color: "B7C6D8", width: 2, endArrowType: "triangle" } });
      }
      s.addText(h, { x, y: y + 1.0, w, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: INK, align: "center", margin: 0, isTextBox: true });
      s.addText(b, { x: x + 0.05, y: y + 1.4, w: w - 0.1, h: 0.75, fontFace: BODY, fontSize: 13, color: SLATE, align: "center", valign: "top", margin: 0, isTextBox: true });
    }
    // Two cards: reaches customers, credit through the gate
    const cards = [
      [MIST, INK, SLATE, "Reaches the merchant's customers", "For udhaar, Saathi messages the customer on WhatsApp in their language with the merchant's verified P2M UPI link. Never a P2P collect request (withdrawn 1 Oct 2025). The customer pays; the ledger closes itself."],
      [INK, SAFFRON, PALE, "Credit only through the gate", "A loan is mentioned only when the ledger shows a cash gap and the merchant has consented. Saathi reads the lender, APR and Key Fact Statement aloud, logs consent, keeps the cooling-off, and raises a human approval. It cannot disburse."],
    ];
    for (let i = 0; i < 2; i++) {
      const [bg, hc, bc, h, b] = cards[i];
      const x = 0.6 + i * 6.15;
      card(s, x, 3.9, 5.95, 1.55, bg);
      s.addText(h, { x: x + 0.3, y: 4.0, w: 5.35, h: 0.38, fontFace: HEAD, fontSize: 17, bold: true, color: hc, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(b, { x: x + 0.3, y: 4.4, w: 5.35, h: 1.0, fontFace: BODY, fontSize: 13.5, color: bc, margin: 0, valign: "top", isTextBox: true });
    }
    // Compliance strip
    const comp = [
      ["TRAI", "AI disclosed in the first sentence. Calls only 9 AM to 7 PM. No loan pitch on a service call."],
      ["RBI Digital Lending 2025", "Lender named, KFS read, cooling-off kept, no automatic limit increase."],
      ["DPDP", "Consent per purpose, timestamped, revocable, shown on the dashboard."],
      ["FREE-AI", "Every rupee spoken is a deterministic sum; the log shows the line behind it."],
    ];
    const cw2 = (12.1 - 3 * 0.15) / 4;
    for (let i = 0; i < comp.length; i++) {
      const x = 0.6 + i * (cw2 + 0.15);
      s.addShape("roundRect", { x, y: 5.6, w: cw2, h: 1.05, fill: { color: WHITE }, line: { color: MIST2, width: 1.25 }, rectRadius: 0.1 });
      s.addText(comp[i][0], { x: x + 0.15, y: 5.65, w: cw2 - 0.3, h: 0.28, fontFace: HEAD, fontSize: 12, bold: true, color: CYAN_DK, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(comp[i][1], { x: x + 0.15, y: 5.93, w: cw2 - 0.3, h: 0.7, fontFace: BODY, fontSize: 12, color: SLATE, margin: 0, isTextBox: true, valign: "top" });
    }
    s.addText("The demo: Ravi's phone rings. Soundbox fixed before he answers, ₹2,300 udhaar collected on WhatsApp, a ₹50,000 loan approved by a human.", {
      x: 0.6, y: 6.72, w: 12.1, h: 0.3, fontFace: BODY, fontSize: 13.5, italic: true, bold: true, color: CYAN_DK, margin: 0, isTextBox: true, valign: "middle",
    });
    footer(s, 3);
  }

  // ---------- 4. Tech stack ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Tech stack");
    title(s, "Sarvam AI is the voice; code holds the rules");
    const arrow = (x, y, w, h) => s.addShape("line", { x, y, w, h, line: { color: "8FA3BF", width: 2, endArrowType: "triangle" } });
    const REAL = [CYAN, INK], SIM = [SAFFRON, INK], BUILT = [MIST2, INK];

    // Legend
    tag(s, "REAL", 8.75, 1.3, ...REAL, 0.85);
    tag(s, "SIMULATED", 9.7, 1.3, ...SIM, 1.15);
    tag(s, "BUILT, NOT LIVE", 10.95, 1.3, ...BUILT, 1.75);

    // Left: triggers
    const lx = 0.6, lw = 2.65, top = 1.7, bh = 3.45;
    card(s, lx, top, lw, bh, MIST);
    s.addText("Merchant data", { x: lx + 0.25, y: top + 0.15, w: lw - 0.5, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
    tag(s, "SIMULATED", lx + 0.25, top + 0.58, ...SIM, 1.15);
    bullets(s, ["20 seeded merchants", "Soundbox events", "Settlements", "Udhaar ledger", "Loan eligibility", "Swap to Paytm APIs by config"], { x: lx + 0.25, y: top + 1.0, w: lw - 0.4, h: 2.4, fontSize: 13.5, color: SLATE, paraSpaceAfter: 3 });

    // Centre: agent on Sarvam
    const cx = 3.65, cw = 5.95;
    card(s, cx, top, cw, 1.55, INK);
    s.addText("Saathi agent on Sarvam AI", { x: cx + 0.25, y: top + 0.1, w: 3.6, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, margin: 0, isTextBox: true, valign: "middle" });
    tag(s, "REAL", cx + cw - 1.1, top + 0.15, ...REAL, 0.85);
    const models = [["Listen", "saarika:v2.5", "speech-to-text, hi-IN and kn-IN"], ["Think", "sarvam-105b", "tool-calling LLM, decides every step"], ["Speak", "bulbul:v3", "text-to-speech, streamed by sentence"]];
    const mw = (cw - 0.5 - 0.3) / 3;
    for (let i = 0; i < 3; i++) {
      const x = cx + 0.25 + i * (mw + 0.15);
      s.addShape("roundRect", { x, y: top + 0.55, w: mw, h: 0.9, fill: { color: INK3 }, line: { color: INK3 }, rectRadius: 0.08 });
      s.addText([
        { text: models[i][0] + "  ", options: { color: CYAN, bold: true } },
        { text: models[i][1], options: { color: WHITE, bold: true, breakLine: true } },
        { text: models[i][2], options: { color: PALE, fontSize: 11 } },
      ], { x: x + 0.12, y: top + 0.58, w: mw - 0.24, h: 0.85, fontFace: BODY, fontSize: 13, margin: 0, isTextBox: true, valign: "middle" });
    }
    card(s, cx, top + 1.7, cw, 1.0, MIST);
    tag(s, "REAL", cx + cw - 1.1, top + 1.8, ...REAL, 0.85);
    s.addText([
      { text: "Tool layer, typed registry. ", options: { bold: true, color: INK } },
      { text: "One role per tool: Diagnoser, Fixer, Seller, Compliance, Manager. A compliance ticket gates send_reminder and offer_loan in code, whatever the model says.", options: { color: SLATE } },
    ], { x: cx + 0.25, y: top + 1.75, w: cw - 1.5, h: 0.9, fontFace: BODY, fontSize: 13, margin: 0, isTextBox: true, valign: "middle" });
    s.addShape("roundRect", { x: cx, y: top + 2.85, w: cw, h: 0.6, fill: { color: WHITE }, line: { color: SAFFRON, width: 1.5, dashType: "dash" }, rectRadius: 0.1 });
    await iconCircle(s, fa.FaUserCheck, cx + 0.15, top + 2.93, 0.44, SAFFRON, INK);
    s.addText("Human approval card on the dashboard; mandatory above ₹25,000. The agent has no disburse tool.", {
      x: cx + 0.75, y: top + 2.85, w: cw - 0.9, h: 0.6, fontFace: BODY, fontSize: 13, bold: true, color: INK, valign: "middle", margin: 0, isTextBox: true,
    });

    // Right: channels
    const rx = 10.1, rw = 2.6;
    card(s, rx, top, rw, bh, INK);
    s.addText("Channels", { x: rx + 0.25, y: top + 0.15, w: rw - 0.5, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, margin: 0, isTextBox: true, valign: "middle" });
    const ch = [
      ["Browser call screen (plan A)", REAL, "REAL", 0.85],
      ["Twilio Media Streams; Exotel next", BUILT, "BUILT, NOT LIVE", 1.75],
      ["WhatsApp utility message (Twilio)", REAL, "REAL", 0.85],
      ["Live ₹ dashboard (server-sent events)", REAL, "REAL", 0.85],
    ];
    for (let i = 0; i < ch.length; i++) {
      const y = top + 0.65 + i * 0.7;
      tag(s, ch[i][2], rx + 0.25, y, ...ch[i][1], ch[i][3]);
      s.addText(ch[i][0], { x: rx + 0.25, y: y + 0.27, w: rw - 0.4, h: 0.42, fontFace: BODY, fontSize: 12.5, color: PALE, margin: 0, isTextBox: true, valign: "top" });
    }
    arrow(3.28, top + 0.75, 0.34, 0);
    arrow(9.63, top + 0.75, 0.44, 0);

    // Bottom strip: measured facts
    const facts = [
      [fa.FaStopwatch, "Measured 30 Oct", "1.5 to 3.2 s from end of speech to first word back. The opening briefing is prepared while the phone rings."],
      [fa.FaVial, "Tested", "Typecheck and 65 unit tests. Live LLM tests in Hindi and Kannada assert compliance runs before every gated action."],
      [fa.FaPlug, "Swappable", "Node and TypeScript. Every tool has an HTTP surface, so a real Paytm API drops in without touching the agent."],
    ];
    const fw = (12.1 - 2 * 0.2) / 3;
    for (let i = 0; i < 3; i++) {
      const x = 0.6 + i * (fw + 0.2);
      card(s, x, 5.4, fw, 1.4, MIST);
      await iconCircle(s, facts[i][0], x + 0.2, 5.58, 0.55, INK, CYAN);
      s.addText(facts[i][1], { x: x + 0.9, y: 5.5, w: fw - 1.1, h: 0.38, fontFace: HEAD, fontSize: 14, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(facts[i][2], { x: x + 0.2, y: 6.2, w: fw - 0.4, h: 0.58, fontFace: BODY, fontSize: 12.5, color: SLATE, margin: 0, isTextBox: true, valign: "top" });
    }
    footer(s, 4);
  }

  // ---------- 5. USP ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    kicker(s, "USP", true);
    title(s, "The triple nobody else ships", true);
    s.addText("Event-triggered outreach  ·  reaches the merchant's customers  ·  consent-gated credit", {
      x: 0.6, y: 1.2, w: 12.1, h: 0.35, fontFace: BODY, fontSize: 16, color: PALE, margin: 0, isTextBox: true, valign: "middle",
    });
    const Y = (t) => ({ text: t, options: { fill: { color: "0F4F6B" }, color: WHITE } });
    const P = (t) => ({ text: t, options: { fill: { color: "4A3A1A" }, color: SAFFRON } });
    const N = (t) => ({ text: t, options: { fill: { color: INK2 }, color: "8FA3BF" } });
    const hdr = ["", "Proactive, event-triggered", "Reaches the merchant's customers", "Acts, not just answers", "Consent-gated credit"].map((t, i) => ({
      text: t, options: { bold: true, color: i ? CYAN : WHITE, fill: { color: INK }, fontSize: 13, fontFace: HEAD },
    }));
    const name = (t, sub) => ({ text: [{ text: t, options: { bold: true, color: WHITE, breakLine: true } }, { text: sub, options: { color: "8FA3BF", fontSize: 11 } }], options: { fill: { color: INK } } });
    const rows = [
      hdr,
      [{ text: "Saathi", options: { bold: true, color: SAFFRON, fill: { color: INK }, fontSize: 16, fontFace: HEAD } },
        Y("Yes. Wakes on device silent, settlement stuck, udhaar ageing"), Y("Yes. WhatsApp with the merchant's P2M UPI link"), Y("Yes. Restarts, retries, reminds, offers; human on the money step"), Y("Yes. Consent, KFS read, cooling-off, human approval")],
      [name("BharatPe Agentic AI", "Sep 2026, in-app"), P("Partly. Follows up on requests the merchant raised"), N("No"), Y("Yes. Chargebacks, 60+ systems"), P("Partly. Pushes Credit-on-UPI offers in-app")],
      [name("Paytm AI Soundbox", "Oct 2025, 11 languages"), N("No. Answers questions on the device"), N("No"), N("No. Reports payments and performance"), N("No")],
      [name("Razorpay RAY", "Sep 2026, WhatsApp"), P("Partly. Issues alerts, online PG only"), N("No"), P("Partly. Checks settlements, answers"), N("No")],
      [name("Khatabook IVR", "paid robocalls, SMS"), N("No. Merchant schedules the blast"), Y("Yes. A recorded call, no conversation"), N("No. Same message to everyone"), P("Partly. In-app NBFC loans, not agent-led")],
    ];
    s.addTable(rows, {
      x: 0.6, y: 1.65, w: 12.1, colW: [2.3, 2.45, 2.45, 2.45, 2.45], rowH: [0.5, 0.78, 0.62, 0.62, 0.62, 0.62],
      fontFace: BODY, fontSize: 13, color: WHITE, valign: "middle", margin: [4, 6, 4, 6],
      border: { type: "solid", color: INK, pt: 2 },
    });
    s.addText([
      { text: "Compliance is the tiebreaker, and it is on screen, not on a slide. ", options: { bold: true, color: WHITE } },
      { text: "TRAI: AI disclosed, 9 AM to 7 PM, no loan pitch on a service call. RBI Digital Lending Directions 2025: KFS, cooling-off, no auto limit increase. DPDP: consent per purpose. FREE-AI: every number explainable. The dashboard shows consent time, KFS read, APR, cooling-off, and a greyed-out Disburse the agent cannot press.", options: { color: PALE } },
    ], { x: 0.6, y: 5.6, w: 12.1, h: 0.85, fontFace: BODY, fontSize: 13, margin: 0, isTextBox: true, valign: "top" });
    s.addText("Other voice bots wait for questions. Saathi hunts for lost money and acts.", {
      x: 0.6, y: 6.5, w: 12.1, h: 0.42, fontFace: BODY, fontSize: 20, italic: true, bold: true, color: SAFFRON, margin: 0, isTextBox: true, valign: "middle",
    });
    footer(s, 5, true);
  }

  // ---------- 6. Impact & Benefits ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Impact and benefits");
    title(s, "Measured in Paytm's own numbers");
    const stats = [
      ["1.64 crore", "storefronts with a Soundbox. Saathi works over phone and WhatsApp, so every one of them, not only the new AI device.", "Paytm Q2 FY27"],
      ["~7%", "of subscription merchants have taken a loan; over half of disbursements go to repeat borrowers. The first-time borrower is the gap.", "Paytm Q4 FY26 call, Q2 FY27"],
      ["₹912 crore", "financial-services distribution revenue in one quarter, up 49% YoY. Saathi feeds this funnel at the moment of need.", "Paytm Q2 FY27"],
      ["Top 2", "complaint clusters in Paytm's own support pages and store reviews: Soundbox silence and settlements. Saathi's first two triggers.", "business.paytm.com, Play Store"],
    ];
    const w = 2.85, gap = 0.233;
    for (let i = 0; i < stats.length; i++) {
      const x = 0.6 + i * (w + gap);
      card(s, x, 1.4, w, 2.45, i === 0 ? INK : MIST);
      s.addText(stats[i][0], { x: x + 0.25, y: 1.5, w: w - 0.5, h: 0.7, fontFace: HEAD, fontSize: 32, bold: true, color: i === 0 ? SAFFRON : CYAN_DK, margin: 0, isTextBox: true, valign: "middle" });
      s.addText(stats[i][1], { x: x + 0.25, y: 2.2, w: w - 0.5, h: 1.3, fontFace: BODY, fontSize: 13, color: i === 0 ? PALE : SLATE, valign: "top", margin: 0, isTextBox: true });
      s.addText(stats[i][2], { x: x + 0.25, y: 3.5, w: w - 0.5, h: 0.28, fontFace: BODY, fontSize: 10, italic: true, color: i === 0 ? "8FA3BF" : GREY, margin: 0, isTextBox: true });
    }
    // Targets
    const tx = 0.6, tw = 5.3;
    s.addText("Pilot targets (targets, not measurements)", { x: tx, y: 4.05, w: tw, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
    const targets = [
      [fa.FaTicketAlt, "Tickets deflected", "Soundbox and settlement issues resolved before the merchant calls"],
      [fa.FaRupeeSign, "Udhaar recovered", "Rupees collected per store per month, attributed to a Saathi reminder"],
      [fa.FaUserPlus, "First-time borrowers", "Consented, KFS-read, human-approved offers against the 7% base"],
    ];
    for (let i = 0; i < targets.length; i++) {
      const y = 4.55 + i * 0.75;
      await iconCircle(s, targets[i][0], tx, y + 0.05, 0.55, INK, CYAN);
      s.addText([
        { text: targets[i][1] + "  ", options: { bold: true, color: INK, fontFace: HEAD, fontSize: 14 } },
        { text: targets[i][2], options: { color: SLATE } },
      ], { x: tx + 0.75, y, w: tw - 0.75, h: 0.68, fontFace: BODY, fontSize: 13, margin: 0, isTextBox: true, valign: "middle" });
    }
    // Worked example
    const ex = 6.2, ew = 6.5;
    card(s, ex, 4.05, ew, 2.85, INK);
    s.addText("One merchant, one month: a worked example", { x: ex + 0.3, y: 4.15, w: ew - 0.6, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: SAFFRON, margin: 0, isTextBox: true, valign: "middle" });
    s.addText([
      { text: "Takings ₹14,200 a day (demo seed), about ₹1,000 per trading hour.", options: { breakLine: true } },
      { text: "A1 (assumption): ", options: { bold: true, color: CYAN } }, { text: "Soundbox silent one hour a week; one customer in four walks out. ₹250 a week, ₹1,000 a month protected.", options: { breakLine: true } },
      { text: "A2 (assumption): ", options: { bold: true, color: CYAN } }, { text: "Unrecovered udhaar about ₹8,200 a month per store (vendor survey, estimate); reminders recover a quarter. ₹2,050 a month collected.", options: { breakLine: true } },
      { text: "Cost: ", options: { bold: true, color: CYAN } }, { text: "10 short calls at ₹3 to 5 plus 30 WhatsApp messages at ₹0.115 (list prices, estimate). Under ₹50 a month.", options: { breakLine: true } },
      { text: "About ₹3,000 kept for about ₹50 spent. ", options: { bold: true, color: SAFFRON } }, { text: "Loan income excluded: the per-loan take rate is not public." },
    ], { x: ex + 0.3, y: 4.55, w: ew - 0.6, h: 2.3, fontFace: BODY, fontSize: 13, color: PALE, margin: 0, isTextBox: true, valign: "top", paraSpaceAfter: 3 });
    footer(s, 6);
  }

  // ---------- 7. Business model ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    kicker(s, "Business model", true);
    title(s, "A ₹30 to 50 add-on that pays for itself", true);
    const cols = [
      [fa.FaStore, "Merchant add-on", [
        "₹30 to 50 a month on top of the Soundbox subscription (merchants already pay about ₹100 a month for the audio device).",
        "Or inference-fee pass-through, the model Paytm has announced for the AI Soundbox.",
        "Voice for exceptions only; a WhatsApp utility message for the daily summary.",
      ]],
      [fa.FaCalculator, "Unit economics", [
        "A three-minute call: ₹3 to 5 at Sarvam list prices (STT ₹0.49/min, TTS ₹1 per 1k chars, telephony ₹0.7 to 1.15/min). Estimate.",
        "A WhatsApp utility message: ₹0.115.",
        "Ten calls and thirty messages a month fit inside the fee with margin to spare.",
      ]],
      [fa.FaHandshake, "Lending revenue share", [
        "Saathi is a distribution surface, never the lender. Loans come from Paytm's existing 14 lending partners.",
        "Paytm keeps its distribution revenue (₹912 crore a quarter today) on every first-time borrower Saathi converts.",
        "No limit changes, no disbursal, no collections by the agent.",
      ]],
    ];
    const w = 3.9;
    for (let i = 0; i < cols.length; i++) {
      const [I, h, items] = cols[i];
      const x = 0.6 + i * (w + 0.2);
      card(s, x, 1.45, w, 3.3, INK2);
      await iconCircle(s, I, x + 0.3, 1.65, 0.7, i === 1 ? SAFFRON : CYAN, INK);
      s.addText(h, { x: x + 1.15, y: 1.65, w: w - 1.4, h: 0.7, fontFace: HEAD, fontSize: 18, bold: true, color: WHITE, margin: 0, isTextBox: true, valign: "middle" });
      bullets(s, items, { x: x + 0.3, y: 2.5, w: w - 0.6, h: 2.2, fontSize: 13, color: PALE, paraSpaceAfter: 5 });
    }
    s.addText("ROLLOUT", { x: 0.6, y: 5.0, w: 4, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: CYAN, charSpacing: 3, margin: 0, isTextBox: true });
    const phases = [
      ["Today", "Live Hindi and Kannada agent on Sarvam, three triggers, simulated merchant backend, WhatsApp sandbox."],
      ["Pilot: one city", "Shadow mode with human review on every action. Scored in rupees recovered, collected and offered."],
      ["Scale", "All 1.64 crore Soundbox storefronts over phone and WhatsApp, 10+ languages, Exotel as carrier."],
    ];
    const pw = 3.9;
    for (let i = 0; i < phases.length; i++) {
      const x = 0.6 + i * (pw + 0.2);
      if (i < phases.length - 1) {
        s.addShape("line", { x: x + 2.3, y: 5.57, w: pw - 2.1, h: 0, line: { color: "3A5478", width: 2, endArrowType: "triangle" } });
      }
      s.addShape("ellipse", { x: x + 0.05, y: 5.45, w: 0.24, h: 0.24, fill: { color: i === 0 ? SAFFRON : CYAN }, line: { color: INK, width: 2 } });
      s.addText(phases[i][0], { x: x + 0.45, y: 5.38, w: 1.8, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, margin: 0, valign: "middle", isTextBox: true });
      s.addText(phases[i][1], { x: x + 0.05, y: 5.85, w: pw - 0.3, h: 0.9, fontFace: BODY, fontSize: 13.5, color: PALE, valign: "top", margin: 0, isTextBox: true });
    }
    footer(s, 7, true);
  }

  // ---------- 8. Backup: what the LLM is not allowed to do ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Backup");
    title(s, "What the LLM is not allowed to do");
    s.addText("The model chooses words and the next tool. Everything else is deterministic code, and the demo shows it.", {
      x: 0.6, y: 1.2, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 16, color: SLATE, margin: 0, isTextBox: true, valign: "middle",
    });
    const lx = 0.6, lw = 5.9;
    card(s, lx, 1.75, lw, 4.95, INK);
    await iconCircle(s, fa.FaBan, lx + 0.3, 1.95, 0.6, SAFFRON, INK);
    s.addText("Never", { x: lx + 1.05, y: 1.95, w: 3, h: 0.6, fontFace: HEAD, fontSize: 20, bold: true, color: WHITE, margin: 0, isTextBox: true, valign: "middle" });
    bullets(s, [
      "No arithmetic. Every rupee it speaks is a sum computed by the backend and passed in as text.",
      "No money movement. There is no disburse, refund or transfer tool in the registry.",
      "No credit limit changes, ever; no automatic top-ups.",
      "No loan mention on a service call unless the ledger shows a cash gap and the merchant has consented.",
      "No action outside the typed tool registry; a tool call the compliance ticket has not cleared is refused in code.",
      "No call outside calling hours and no call to a DND number; the tool layer refuses regardless of the prompt.",
    ], { x: lx + 0.3, y: 2.7, w: lw - 0.6, h: 3.9, fontSize: 15, color: PALE, paraSpaceAfter: 7 });

    const rx = 6.8, rw = 5.9;
    card(s, rx, 1.75, rw, 4.95, MIST);
    await iconCircle(s, fa.FaCodeBranch, rx + 0.3, 1.95, 0.6, INK, CYAN);
    s.addText("Deterministic triggers and gates", { x: rx + 1.05, y: 1.95, w: rw - 1.3, h: 0.6, fontFace: HEAD, fontSize: 20, bold: true, color: INK, margin: 0, isTextBox: true, valign: "middle" });
    const rules = [
      ["Device silent", "no announcement for more than 30 minutes while the app shows inflows"],
      ["Settlement stuck", "status Pending or Failed past T+1"],
      ["Udhaar ageing", "a ledger line older than 10 days (demo: 12 and 15 days)"],
      ["Reminder gate", "6 checks before a send, including consent, calling hours, DND and the approved template"],
      ["Loan gate", "9 checks before an offer, including eligibility, lender named, KFS, explicit consent and cooling-off"],
      ["Human approval", "mandatory above ₹25,000; the Approve button is on the dashboard, not in the agent"],
    ];
    s.addText(rules.flatMap((r, j) => [
      { text: r[0] + ": ", options: { bold: true, color: INK, fontFace: HEAD, fontSize: 14.5 } },
      { text: r[1], options: { color: SLATE, breakLine: j < rules.length - 1 } },
    ]), { x: rx + 0.3, y: 2.7, w: rw - 0.6, h: 3.9, fontFace: BODY, fontSize: 15, margin: 0, isTextBox: true, valign: "top", paraSpaceAfter: 8 });
    footer(s, 8);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await pres.writeFile({ fileName: OUT_PPTX });
  console.log("written", OUT_PPTX);

  // PDF export through LibreOffice, same method as the submitted deck (27 Oct).
  const soffice = ["soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"].find((c) => {
    const r = spawnSync(c, ["--version"], { stdio: "ignore" });
    return r.status === 0;
  });
  if (!soffice) {
    console.log("LibreOffice not found; PDF not exported");
    return;
  }
  const r = spawnSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", OUT_DIR, OUT_PPTX], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("PDF export failed");
  const pdf = path.join(OUT_DIR, "Saathi_Pitch_Track3.pdf");
  console.log("written", pdf, (fs.statSync(pdf).size / 1024).toFixed(0) + " KB");
})().catch((e) => { console.error(e); process.exit(1); });
