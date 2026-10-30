const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

// Palette: deep ink navy dominant, electric cyan accent, warm saffron spark
const INK = "0A1A33";
const INK2 = "13294D";
const CYAN = "00B4E6";
const SAFFRON = "FFA62B";
const WHITE = "FFFFFF";
const MIST = "EEF4FA";
const SLATE = "4A5B73";
const HEAD = "Arial";
const BODY = "Calibri";

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

function title(slide, text, dark = false) {
  slide.addText(text, {
    x: 0.6, y: 0.4, w: 12.1, h: 0.8, fontFace: HEAD, fontSize: 34, bold: true,
    color: dark ? WHITE : INK, margin: 0, isTextBox: true,
  });
}

function kicker(slide, text, dark = false) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.15, w: 8, h: 0.3, fontFace: BODY, fontSize: 12, bold: true,
    color: dark ? CYAN : "0089B3", charSpacing: 3, margin: 0, isTextBox: true,
  });
}

function footer(slide, n, dark = false) {
  slide.addText(`Saathi  ·  Track 3: Autonomous AI Teammates  ·  ${n}`, {
    x: 0.6, y: 7.0, w: 12.1, h: 0.3, fontFace: BODY, fontSize: 10,
    color: dark ? "8FA3BF" : "8A97A8", align: "right", margin: 0, isTextBox: true,
  });
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.title = "Saathi: Autonomous AI Teammate for Merchant Service and Sales";
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

  // ---------- 1. Title ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    s.addShape("ellipse", { x: 8.6, y: -1.4, w: 6.4, h: 6.4, fill: { color: INK2 }, line: { color: INK2 } });
    s.addShape("ellipse", { x: 10.2, y: 3.9, w: 4.2, h: 4.2, fill: { color: "0E2443" }, line: { color: "0E2443" } });
    await iconCircle(s, fa.FaUsersCog, 10.15, 1.35, 2.3, CYAN, INK);
    s.addText("PAYTM BUILD FOR INDIA AI HACKATHON · BENGALURU", {
      x: 0.8, y: 1.0, w: 8.5, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: CYAN, charSpacing: 3, margin: 0, isTextBox: true,
    });
    s.addText("Saathi", {
      x: 0.8, y: 1.6, w: 8.5, h: 1.4, fontFace: HEAD, fontSize: 72, bold: true, color: WHITE, margin: 0, isTextBox: true,
    });
    s.addText("A team of AI agents that owns a revenue target for every Paytm merchant", {
      x: 0.8, y: 3.05, w: 8.2, h: 1.1, fontFace: BODY, fontSize: 24, color: "C9D6E8", margin: 0, isTextBox: true,
    });
    s.addText([
      { text: "Track 3: ", options: { bold: true, color: SAFFRON } },
      { text: "Autonomous AI Teammates", options: { color: WHITE } },
    ], { x: 0.8, y: 4.45, w: 8, h: 0.4, fontFace: BODY, fontSize: 18, margin: 0, isTextBox: true });
    s.addText([
      { text: "Team: ", options: { bold: true, color: "8FA3BF" } },
      { text: "Saathi", options: { color: WHITE, breakLine: true } },
      { text: "Member: ", options: { bold: true, color: "8FA3BF" } },
      { text: "Amit Mishra", options: { color: WHITE } },
    ], { x: 0.8, y: 5.5, w: 8, h: 0.8, fontFace: BODY, fontSize: 16, margin: 0, paraSpaceAfter: 4, isTextBox: true });
  }

  // ---------- 2. Problem ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Problem statement");
    title(s, "Money leaks silently, and nobody owns it");
    s.addText("Ravi's kirana Soundbox in Jayanagar went silent on Friday. He found out on Monday, after three days of missed payments.", {
      x: 0.6, y: 1.22, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 16, italic: true, color: SLATE, margin: 0, isTextBox: true,
    });
    const cards = [
      [fa.FaTint, "Silent revenue leaks", "A Soundbox offline for days, failed settlements, a broken QR. The merchant loses payments, Paytm loses volume, and no one notices until a complaint."],
      [fa.FaHourglassHalf, "Teams only react", "Support works the ticket queue. Issues get fixed after the merchant calls, often days later, by agents checking 3 to 4 systems by hand."],
      [fa.FaChartLine, "Sales calls go out cold", "Loan and device upgrade calls ignore what is happening in the merchant's business, including the issue they faced last week."],
      [fa.FaLanguage, "Language and reach gap", "Small merchants prefer to talk in Hindi, Kannada, Tamil and other languages, on a call. Vernacular agent capacity is limited and costly."],
    ];
    const w = 2.85, gap = 0.233, y = 1.75;
    for (let i = 0; i < cards.length; i++) {
      const [I, h, b] = cards[i];
      const x = 0.6 + i * (w + gap);
      s.addShape("roundRect", { x, y, w, h: 4.15, fill: { color: MIST }, line: { color: MIST }, rectRadius: 0.12 });
      await iconCircle(s, I, x + 0.3, y + 0.3, 0.85, INK, CYAN);
      s.addText(h, { x: x + 0.3, y: y + 1.35, w: w - 0.6, h: 0.75, fontFace: HEAD, fontSize: 17, bold: true, color: INK, margin: 0, valign: "top", isTextBox: true });
      s.addText(b, { x: x + 0.3, y: y + 2.1, w: w - 0.6, h: 1.9, fontFace: BODY, fontSize: 14, color: SLATE, margin: 0, valign: "top", isTextBox: true });
    }
    s.addText("Today's bots answer questions. Nobody owns the outcome: rupees recovered and earned per merchant.", {
      x: 0.6, y: 6.2, w: 12.1, h: 0.5, fontFace: BODY, fontSize: 17, italic: true, bold: true, color: "0089B3", margin: 0, isTextBox: true,
    });
    footer(s, 2);
  }

  // ---------- 3. Solution ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Proposed solution");
    title(s, "Saathi watches, acts and reports in rupees");
    s.addText("A team of specialist AI agents with one shared target: ₹ recovered and ₹ earned across the merchant base.", {
      x: 0.6, y: 1.25, w: 12.1, h: 0.5, fontFace: BODY, fontSize: 16, color: SLATE, margin: 0, isTextBox: true,
    });
    const steps = [
      [fa.FaEye, "Watch", "Tracks device, settlement and sales signals for every merchant"],
      [fa.FaSearch, "Diagnose", "Finds the root cause and ranks merchants by ₹ at stake"],
      [fa.FaBrain, "Plan", "Picks the playbook: fix, follow up, then a relevant offer"],
      [fa.FaCogs, "Act", "Calls the merchant, retries settlement, sends a field agent, shares an offer"],
      [fa.FaCheckCircle, "Check and learn", "Compliance clears each action; outcomes improve the playbooks"],
    ];
    const w = 2.25, gap = 0.2125, y = 2.0;
    for (let i = 0; i < steps.length; i++) {
      const [I, h, b] = steps[i];
      const x = 0.6 + i * (w + gap);
      await iconCircle(s, I, x + (w - 1.0) / 2, y, 1.0, i === 3 ? SAFFRON : INK, i === 3 ? INK : CYAN);
      if (i < steps.length - 1) {
        s.addShape("line", { x: x + (w + 1.0) / 2 + 0.08, y: y + 0.5, w: w + gap - 1.16, h: 0, line: { color: "B7C6D8", width: 2, endArrowType: "triangle" } });
      }
      s.addText(h, { x, y: y + 1.15, w, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: INK, align: "center", margin: 0, isTextBox: true });
      s.addText(b, { x: x + 0.05, y: y + 1.55, w: w - 0.1, h: 0.95, fontFace: BODY, fontSize: 13, color: SLATE, align: "center", valign: "top", margin: 0, isTextBox: true });
    }
    const modes = [
      ["One manager, four specialists", "A manager agent assigns work to Diagnoser, Fixer, Seller and Compliance agents. Anything risky or high-value goes to a human for approval."],
      ["The demo moment", "A live call in Kannada: Saathi spots a failed settlement, retries it, confirms with the merchant, then offers a loan they qualify for. The ₹ dashboard updates live."],
    ];
    for (let i = 0; i < 2; i++) {
      const x = 0.6 + i * 6.15;
      s.addShape("roundRect", { x, y: 4.85, w: 5.95, h: 1.85, fill: { color: i ? INK : MIST }, line: { color: i ? INK : MIST }, rectRadius: 0.12 });
      s.addText(modes[i][0], { x: x + 0.3, y: 5.05, w: 5.35, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: i ? SAFFRON : INK, margin: 0, isTextBox: true });
      s.addText(modes[i][1], { x: x + 0.3, y: 5.5, w: 5.35, h: 1.1, fontFace: BODY, fontSize: 14, color: i ? "D6E1EE" : SLATE, margin: 0, valign: "top", isTextBox: true });
    }
    footer(s, 3);
  }

  // ---------- 4. Tech stack ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Technology / tech stack");
    title(s, "Signals in, an agent team decides, real actions out");
    const arrow = (x, y, w, h) => s.addShape("line", { x, y, w, h, line: { color: "8FA3BF", width: 2, endArrowType: "triangle" } });

    // Signals (left)
    s.addShape("roundRect", { x: 0.6, y: 1.45, w: 2.55, h: 3.55, fill: { color: MIST }, line: { color: MIST }, rectRadius: 0.12 });
    await iconCircle(s, fa.FaSatelliteDish, 0.8, 1.6, 0.6, INK, CYAN);
    s.addText("Signals", { x: 1.5, y: 1.6, w: 1.6, h: 0.6, fontFace: HEAD, fontSize: 16, bold: true, color: INK, valign: "middle", margin: 0, isTextBox: true });
    const sig = ["Transactions", "Soundbox health", "Settlements", "KYC status", "Past calls"];
    s.addText(sig.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < sig.length - 1 } })), {
      x: 0.8, y: 2.4, w: 2.25, h: 2.4, fontFace: BODY, fontSize: 14, color: SLATE, paraSpaceAfter: 6, valign: "top", margin: 0, isTextBox: true,
    });

    // Manager + specialists (centre)
    const cx = 3.65, cw = 5.95;
    s.addShape("roundRect", { x: cx, y: 1.45, w: cw, h: 0.85, fill: { color: INK }, line: { color: INK }, rectRadius: 0.1 });
    s.addText([
      { text: "Manager agent", options: { bold: true, color: WHITE } },
      { text: "  ranks merchants by ₹ at stake and assigns work", options: { color: "C9D6E8" } },
    ], { x: cx + 0.25, y: 1.45, w: cw - 0.5, h: 0.85, fontFace: BODY, fontSize: 15, valign: "middle", margin: 0, isTextBox: true });
    const agents = [["Diagnoser", "finds root cause"], ["Fixer", "resolves issues"], ["Seller", "makes offers"], ["Compliance", "checks rules"]];
    const ag = 0.15, aw = (cw - 3 * ag) / 4;
    for (let i = 0; i < agents.length; i++) {
      const x = cx + i * (aw + ag);
      arrow(x + aw / 2, 2.3, 0, 0.45);
      s.addShape("roundRect", { x, y: 2.8, w: aw, h: 1.1, fill: { color: i === 3 ? SAFFRON : MIST }, line: { color: i === 3 ? SAFFRON : "D5E0EC", width: 1 }, rectRadius: 0.1 });
      s.addText(agents[i][0], { x, y: 2.9, w: aw, h: 0.45, fontFace: HEAD, fontSize: 15, bold: true, color: INK, align: "center", valign: "middle", margin: 0, isTextBox: true });
      s.addText(agents[i][1], { x, y: 3.35, w: aw, h: 0.4, fontFace: BODY, fontSize: 12, color: i === 3 ? INK : SLATE, align: "center", valign: "middle", margin: 0, isTextBox: true });
    }
    s.addShape("roundRect", { x: cx, y: 4.15, w: cw, h: 0.85, fill: { color: WHITE }, line: { color: SAFFRON, width: 1.5, dashType: "dash" }, rectRadius: 0.1 });
    await iconCircle(s, fa.FaUserCheck, cx + 0.2, 4.27, 0.6, SAFFRON, INK);
    s.addText("Human supervisor approves risky or high-₹ actions", {
      x: cx + 0.95, y: 4.15, w: cw - 1.15, h: 0.85, fontFace: BODY, fontSize: 15, bold: true, color: INK, valign: "middle", margin: 0, isTextBox: true,
    });

    // Actions (right)
    const rx = 10.1, rw = 2.6;
    s.addShape("roundRect", { x: rx, y: 1.45, w: rw, h: 3.55, fill: { color: INK }, line: { color: INK }, rectRadius: 0.12 });
    await iconCircle(s, fa.FaBolt, rx + 0.2, 1.6, 0.6, SAFFRON, INK);
    s.addText("Actions", { x: rx + 0.9, y: 1.6, w: 1.6, h: 0.6, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, valign: "middle", margin: 0, isTextBox: true });
    const act = ["Voice call in the merchant's language", "WhatsApp message", "Payment link or refund", "Field agent visit", "₹ dashboard update"];
    s.addText(act.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < act.length - 1 } })), {
      x: rx + 0.2, y: 2.4, w: rw - 0.35, h: 2.5, fontFace: BODY, fontSize: 14, color: "D6E1EE", paraSpaceAfter: 5, valign: "top", margin: 0, isTextBox: true,
    });

    arrow(3.18, 2.0, 0.44, 0);
    arrow(9.63, 3.35, 0.44, 0);

    // Stack strip
    const stack = [
      ["Voice", "Sarvam AI Saaras and Bulbul · Exotel or Twilio · WhatsApp API"],
      ["Agents", "LangGraph · Sarvam-M for Indic reasoning · frontier LLM for planning"],
      ["Data", "RAG on SOPs (pgvector) · PostgreSQL · FastAPI · React dashboard"],
      ["Actions", "Paytm PG sandbox (real) · merchant APIs simulated, swappable"],
    ];
    const sw = (12.1 - 3 * 0.2) / 4;
    for (let i = 0; i < stack.length; i++) {
      const x = 0.6 + i * (sw + 0.2);
      s.addShape("roundRect", { x, y: 5.3, w: sw, h: 1.35, fill: { color: MIST }, line: { color: MIST }, rectRadius: 0.1 });
      s.addText(stack[i][0], { x: x + 0.2, y: 5.4, w: sw - 0.4, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: "0089B3", margin: 0, isTextBox: true });
      s.addText(stack[i][1], { x: x + 0.2, y: 5.75, w: sw - 0.4, h: 0.85, fontFace: BODY, fontSize: 13, color: SLATE, valign: "top", margin: 0, isTextBox: true });
    }
    footer(s, 4);
  }

  // ---------- 5. USP ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    kicker(s, "USP", true);
    title(s, "Why Saathi is a teammate, not a chatbot", true);
    const usps = [
      [fa.FaRupeeSign, "Owns an outcome in ₹", "Measured on rupees recovered and earned, not on replies sent or tickets closed."],
      [fa.FaBell, "Finds problems first", "Watches every merchant and acts before the complaint, while the money can still be saved."],
      [fa.FaUsersCog, "A team, not a bot", "Specialist agents for diagnosis, fixes, sales and compliance, coordinated by a manager agent."],
      [fa.FaComments, "Vernacular and voice-first", "Talks naturally in the merchant's language on a normal phone call, using Sarvam AI's Indic models."],
      [fa.FaGraduationCap, "Learns from your best", "Turns top human agents' calls into playbooks and gets better with every outcome."],
      [fa.FaClipboardCheck, "Safe by design", "Checks consent, TRAI DND and calling hours, and RBI Digital Lending rules before acting. Full audit trail."],
    ];
    const w = 3.9, h = 2.15, gx = 0.2, gy = 0.2;
    for (let i = 0; i < usps.length; i++) {
      const [I, t, b] = usps[i];
      const x = 0.6 + (i % 3) * (w + gx);
      const y = 1.55 + Math.floor(i / 3) * (h + gy);
      s.addShape("roundRect", { x, y, w, h, fill: { color: INK2 }, line: { color: INK2 }, rectRadius: 0.12 });
      await iconCircle(s, I, x + 0.3, y + 0.3, 0.75, i === 0 ? SAFFRON : CYAN, INK);
      s.addText(t, { x: x + 1.25, y: y + 0.3, w: w - 1.5, h: 0.75, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, valign: "middle", margin: 0, isTextBox: true });
      s.addText(b, { x: x + 0.3, y: y + 1.15, w: w - 0.6, h: 0.9, fontFace: BODY, fontSize: 14, color: "C9D6E8", valign: "top", margin: 0, isTextBox: true });
    }
    s.addText("Other voice bots wait for questions. Saathi hunts for lost money and acts.", {
      x: 0.6, y: 6.25, w: 12.1, h: 0.45, fontFace: BODY, fontSize: 18, italic: true, bold: true, color: SAFFRON, margin: 0, isTextBox: true,
    });
    footer(s, 5, true);
  }

  // ---------- 6. Impact ----------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    kicker(s, "Impact and benefits");
    title(s, "Every merchant watched, every rupee counted");
    const stats = [
      ["100%", "of merchants watched daily, not only those who call"],
      ["60%", "of common issues fixed without a human"],
      ["< 1 hr", "from problem detected to fixed, often before the merchant notices"],
      ["2×", "sales conversations per rep, with full context"],
    ];
    const w = 2.85, gap = 0.233;
    for (let i = 0; i < stats.length; i++) {
      const x = 0.6 + i * (w + gap);
      s.addShape("roundRect", { x, y: 1.55, w, h: 2.2, fill: { color: i === 0 ? INK : MIST }, line: { color: i === 0 ? INK : MIST }, rectRadius: 0.12 });
      s.addText(stats[i][0], { x: x + 0.25, y: 1.75, w: w - 0.5, h: 0.95, fontFace: HEAD, fontSize: 44, bold: true, color: i === 0 ? SAFFRON : "0089B3", margin: 0, isTextBox: true });
      s.addText(stats[i][1], { x: x + 0.25, y: 2.75, w: w - 0.5, h: 0.85, fontFace: BODY, fontSize: 14, color: i === 0 ? "D6E1EE" : SLATE, valign: "top", margin: 0, isTextBox: true });
    }
    s.addText("Pilot targets we will validate during the build and in follow-up pilots", {
      x: 0.6, y: 3.85, w: 12.1, h: 0.3, fontFace: BODY, fontSize: 12, italic: true, color: "8A97A8", margin: 0, isTextBox: true,
    });
    const groups = [
      [fa.FaStore, "Merchants", ["Fewer missed payments from device downtime", "Help in their own language, any time", "Right-time credit and upgrades"]],
      [fa.FaUsers, "Paytm teams", ["Agents focus on complex, high-value cases", "Lower cost per resolved ticket", "Every call ends with a clean CRM summary"]],
      [fa.FaChartPie, "Business", ["Revenue recovered and earned, tracked live in ₹", "Less merchant churn", "Higher loan and device upgrade uptake"]],
    ];
    const gw = 3.9;
    for (let i = 0; i < groups.length; i++) {
      const [I, h, items] = groups[i];
      const x = 0.6 + i * (gw + 0.2);
      await iconCircle(s, I, x, 4.4, 0.6, INK, CYAN);
      s.addText(h, { x: x + 0.75, y: 4.4, w: gw - 0.8, h: 0.6, fontFace: HEAD, fontSize: 17, bold: true, color: INK, valign: "middle", margin: 0, isTextBox: true });
      s.addText(items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < items.length - 1 } })), {
        x, y: 5.15, w: gw, h: 1.6, fontFace: BODY, fontSize: 14, color: SLATE, paraSpaceAfter: 6, valign: "top", margin: 0, isTextBox: true,
      });
    }
    footer(s, 6);
  }

  // ---------- 7. Business model ----------
  {
    const s = pres.addSlide();
    s.background = { color: INK };
    kicker(s, "Business model", true);
    title(s, "Pays for itself through savings and revenue", true);
    const cols = [
      [fa.FaPiggyBank, "Cost savings", "Each ticket Saathi resolves costs a fraction of a human-handled call. Savings grow with ticket volume, and agent headcount scales slower than the merchant base."],
      [fa.FaRupeeSign, "Revenue uplift", "The Seller agent drives loan disbursals, Soundbox and EDC subscriptions, and insurance attach. Paytm earns its existing fees and commissions on every conversion."],
      [fa.FaHandshake, "Platform play", "Later, offer Saathi as an outcome-priced SaaS (per resolution or per conversion) to Paytm's lending partners, NBFCs and other fintechs."],
    ];
    const w = 3.9;
    for (let i = 0; i < cols.length; i++) {
      const [I, h, b] = cols[i];
      const x = 0.6 + i * (w + 0.2);
      s.addShape("roundRect", { x, y: 1.55, w, h: 3.05, fill: { color: INK2 }, line: { color: INK2 }, rectRadius: 0.12 });
      await iconCircle(s, I, x + 0.3, 1.8, 0.8, i === 1 ? SAFFRON : CYAN, INK);
      s.addText(h, { x: x + 0.3, y: 2.75, w: w - 0.6, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true, color: WHITE, margin: 0, isTextBox: true });
      s.addText(b, { x: x + 0.3, y: 3.2, w: w - 0.6, h: 1.3, fontFace: BODY, fontSize: 14, color: "C9D6E8", valign: "top", margin: 0, isTextBox: true });
    }
    s.addText("ROLLOUT", { x: 0.6, y: 4.95, w: 4, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: CYAN, charSpacing: 3, margin: 0, isTextBox: true });
    const phases = [
      ["Hackathon", "Live agent team on real calls: 3 leak types, 2 languages, 1 sales play"],
      ["Pilot", "One city in shadow mode with human review, measured in ₹ recovered"],
      ["Scale", "All merchant segments, 10+ languages, Saathi owning a ₹ target"],
    ];
    const pw = 3.9;
    for (let i = 0; i < phases.length; i++) {
      const x = 0.6 + i * (pw + 0.2);
      if (i < phases.length - 1) {
        s.addShape("line", { x: x + 1.95, y: 5.55, w: pw - 1.75, h: 0, line: { color: "3A5478", width: 2, endArrowType: "triangle" } });
      }
      s.addShape("ellipse", { x: x + 0.05, y: 5.43, w: 0.24, h: 0.24, fill: { color: i === 0 ? SAFFRON : CYAN }, line: { color: INK, width: 2 } });
      s.addText(phases[i][0], { x: x + 0.45, y: 5.36, w: pw - 0.5, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, margin: 0, valign: "middle", isTextBox: true });
      s.addText(phases[i][1], { x: x + 0.05, y: 5.85, w: pw - 0.3, h: 0.8, fontFace: BODY, fontSize: 14, color: "C9D6E8", valign: "top", margin: 0, isTextBox: true });
    }
    footer(s, 7, true);
  }

  await pres.writeFile({ fileName: "Saathi_Pitch_Track3.pptx" });
  console.log("written");
})();
