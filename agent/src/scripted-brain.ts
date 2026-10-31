import type { Language } from "../../shared/types.js";
import type { ChatClient, ChatMessage, ChatResult, ToolSpec } from "./llm.js";
import { CALL_CONNECTED_MARKER, PRE_CALL_MARKER } from "./prompt.js";

/**
 * The canonical scene, per language, as fixed lines. Used when the room has no network:
 * the same tools run against the same mock backend; only the phrasing is pre-written
 * (taken from a live Sarvam run) so its audio can be cached ahead of time.
 */
export interface SceneScript {
  fixTool: { name: string; args: Record<string, unknown> };
  reminderCustomerId: string;
  loanAmount: number;
  opening: string;
  afterReminder: string;
  afterLoan: string;
  goodbye: string;
  declined: string;
  unclear: string;
  /** Regexes that recognise the judge's yes for the reminder / the loan / goodbye. */
  yesReminder: RegExp;
  yesLoan: RegExp;
  bye: RegExp;
  no: RegExp;
}

export const SCENES: Record<string, SceneScript> = {
  m001: {
    fixTool: { name: "restart_device", args: { device_id: "SB-7F42" } },
    reminderCustomerId: "c-suresh",
    loanAmount: 50000,
    opening:
      "नमस्ते रवि जी, मैं साथी बोल रही हूँ, Paytm की AI असिस्टेंट। कल शाम 6:02 बजे से आपका Soundbox चुप हो गया था, पर app में 7 पेमेंट 1340 रुपये की आईं जो announce नहीं हुईं, तो ग्राहकों को लगा होगा कि पेमेंट fail हो गया। मैंने अभी आपका Soundbox restart कर दिया है और वो 7 पेमेंट confirm हो गई हैं। कल आपकी कुल कमाई 14200 रुपये थी, 50 पेमेंट से। सबसे पुराना उधार सुरेश जी का है, 2300 रुपये, 12 दिन से बकाया है। क्या मैं सुरेश जी को WhatsApp पर एक polite रिमाइंडर भेज दूँ, UPI पेमेंट लिंक के साथ?",
    afterReminder:
      "सुरेश जी को WhatsApp पर रिमाइंडर भेज दिया है। रवि जी, आप 50000 रुपये तक का working capital लोन ले सकते हैं। पिछले साल दिवाली के आसपास आपकी बिक्री 34% बढ़ी थी और दिवाली 8 दिन में है, तो अभी stock भरने के लिए यह सही समय है। 6 महीने के लिए सालाना 18% ब्याज लगेगा और हर महीने लगभग 9080 रुपये किस्त आएगी। यह लोन Paytm के partner NBFC से आएगा और आप 1 दिन के अंदर बिना किसी cost के इसे छोड़ भी सकते हैं। क्या आप यह लोन लेना चाहेंगे?",
    afterLoan: "ठीक है रवि जी, मैंने 50000 रुपये की लोन request डाल दी है। अब Paytm की team इसे approve करेगी और सारी details आपको WhatsApp पर आ जाएंगी। और कुछ मदद करूँ?",
    goodbye: "ठीक है रवि जी, धन्यवाद। आपका दिन शुभ हो।",
    declined: "कोई बात नहीं रवि जी, जब ज़रूरत हो तब बताइएगा। और कुछ मदद करूँ?",
    unclear: "माफ़ कीजिए रवि जी, आवाज़ साफ़ नहीं आई। एक बार फिर से बोलिए?",
    yesReminder: /रिमाइंडर|reminder|भेज|^(हाँ|हां|यस|yes)/i,
    yesLoan: /लोन|loan|आगे बढ़ो|हाँ/i,
    bye: /धन्यवाद|ठीक है|bye|बस/i,
    no: /नहीं|मत|no\b/i,
  },
  m002: {
    fixTool: { name: "retry_settlement", args: { settlement_id: "S002-20261030" } },
    reminderCustomerId: "c-manjunath",
    loanAmount: 30000,
    opening:
      "ನಮಸ್ಕಾರ ಲಕ್ಷ್ಮಿ ಅವರೇ, ನಾನು ಸಾಥಿ, Paytm ನ AI ಸಹಾಯಕಿ. ನಿನ್ನೆಯ 8450 ರೂಪಾಯಿ ಸೆಟಲ್ಮೆಂಟ್ ವಿಫಲವಾಗಿತ್ತು, ಅದನ್ನು ನಾನು ಈಗ ಮತ್ತೆ ಕಳಿಸಿದ್ದೇನೆ, 30 ನಿಮಿಷದಲ್ಲಿ ಹಣ ನಿಮ್ಮ ಖಾತೆಗೆ ಬರುತ್ತದೆ. ನಿನ್ನೆ ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಒಟ್ಟು 11650 ರೂಪಾಯಿ ವ್ಯಾಪಾರ ಆಗಿದೆ, 42 ಪೇಮೆಂಟ್ ಬಂದಿದೆ. ಮಂಜುನಾಥ್ ಅವರ 1800 ರೂಪಾಯಿ ಬಾಕಿ 15 ದಿನಗಳಿಂದ ಇದೆ. ಅವರಿಗೆ WhatsApp ನಲ್ಲಿ ಒಂದು ವಿನಯಪೂರ್ವಕ ರಿಮೈಂಡರ್ UPI ಲಿಂಕ್ ಜೊತೆ ಕಳಿಸಲಾ?",
    afterReminder:
      "ಮಂಜುನಾಥ್ ಅವರಿಗೆ WhatsApp ನಲ್ಲಿ ರಿಮೈಂಡರ್ ಕಳಿಸಿದ್ದೇನೆ. ಲಕ್ಷ್ಮಿ ಅವರೇ, ನಿಮಗೆ 30000 ರೂಪಾಯಿ ವರೆಗೆ ಲೋನ್ ಸಿಗುತ್ತದೆ. ಕಳೆದ ವರ್ಷ ದೀಪಾವಳಿ ಸಮಯದಲ್ಲಿ ನಿಮ್ಮ ವ್ಯಾಪಾರ 29% ಹೆಚ್ಚಾಗಿತ್ತು, ದೀಪಾವಳಿಗೆ ಇನ್ನು 8 ದಿನ ಇದೆ, ಹಾಗಾಗಿ ಸ್ಟಾಕ್ ತರಲು ಇದು ಸರಿಯಾದ ಸಮಯ. 6 ತಿಂಗಳ ಅವಧಿ, ವಾರ್ಷಿಕ 18% ಬಡ್ಡಿ, ತಿಂಗಳಿಗೆ ಸುಮಾರು 5450 ರೂಪಾಯಿ ಕಂತು. ಇದು Paytm ನ partner NBFC ಮೂಲಕ ಬರುತ್ತದೆ, 1 ದಿನದೊಳಗೆ ಯಾವುದೇ ದಂಡ ಇಲ್ಲದೆ ಹಿಂದೆ ಸರಿಯಬಹುದು. ಈ ಲೋನ್ ಬೇಕಾ?",
    afterLoan: "ಸರಿ ಲಕ್ಷ್ಮಿ ಅವರೇ, 30000 ರೂಪಾಯಿ ಲೋನ್ ಗೆ request ಹಾಕಿದ್ದೇನೆ. Paytm ತಂಡದವರು ಒಪ್ಪಿಗೆ ಕೊಡ್ತಾರೆ, ಎಲ್ಲಾ ವಿವರ WhatsApp ನಲ್ಲಿ ಬರುತ್ತದೆ. ಇನ್ನೇನಾದರೂ ಸಹಾಯ ಬೇಕಾ?",
    goodbye: "ಸರಿ ಲಕ್ಷ್ಮಿ ಅವರೇ, ಧನ್ಯವಾದಗಳು. ಒಳ್ಳೆಯ ದಿನ ನಿಮ್ಮದಾಗಲಿ.",
    declined: "ಪರವಾಗಿಲ್ಲ ಲಕ್ಷ್ಮಿ ಅವರೇ, ಬೇಕಾದಾಗ ಹೇಳಿ. ಇನ್ನೇನಾದರೂ ಸಹಾಯ ಬೇಕಾ?",
    unclear: "ಕ್ಷಮಿಸಿ ಲಕ್ಷ್ಮಿ ಅವರೇ, ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ಇನ್ನೊಮ್ಮೆ ಹೇಳ್ತೀರಾ?",
    yesReminder: /ರಿಮೈಂಡರ್|reminder|ಕಳಿಸಿ|^(ಹೌದು|yes)/i,
    yesLoan: /ಲೋನ್|loan|ಮುಂದುವರಿಸಿ|ಹೌದು/i,
    bye: /ಧನ್ಯವಾದ|ಸರಿ|bye|ಸಾಕು/i,
    no: /ಬೇಡ|ಇಲ್ಲ|no\b/i,
  },
};

/** Every Saathi line the scripted scene can speak, for TTS pre-caching. */
export function sceneLines(merchantId: string): string[] {
  const s = SCENES[merchantId];
  if (!s) return [];
  return [s.opening, s.afterReminder, s.afterLoan, s.goodbye, s.declined, s.unclear];
}

type Phase = "pre" | "opening" | "reminder" | "loan" | "close";

/**
 * A ChatClient that never calls a model: it walks the scene and issues the same tool calls
 * the live agent makes, so the dashboard, compliance gates and counters behave identically.
 */
export class ScriptedBrain implements ChatClient {
  private phase: Phase = "pre";
  private n = 0;
  private readonly scene: SceneScript;

  constructor(merchantId: string, _language?: Language) {
    const s = SCENES[merchantId];
    if (!s) throw new Error(`no scripted scene for ${merchantId}`);
    this.scene = s;
  }

  private tc(name: string, args: Record<string, unknown>) {
    return { id: `s${++this.n}`, name, args, rawArguments: JSON.stringify(args) };
  }
  private say(text: string): ChatResult {
    return { content: text, toolCalls: [], ms: 0 };
  }
  private call(name: string, args: Record<string, unknown>): ChatResult {
    return { content: null, toolCalls: [this.tc(name, args)], ms: 0 };
  }

  async complete(messages: ChatMessage[], _tools: ToolSpec[]): Promise<ChatResult> {
    const last = messages[messages.length - 1]!;
    const user = [...messages].reverse().find((m) => m.role === "user") as { content: string } | undefined;
    const text = user?.content ?? "";
    const lastTool = last.role === "tool" ? last.name : undefined;
    const s = this.scene;

    if (text === PRE_CALL_MARKER) {
      if (last.role === "user") return this.call("get_briefing", {});
      if (lastTool === "get_briefing") return this.call(s.fixTool.name, s.fixTool.args);
      return this.say("READY");
    }
    if (text === CALL_CONNECTED_MARKER) {
      this.phase = "opening";
      return this.say(s.opening);
    }
    if (last.role === "user") {
      if (text.startsWith("[phone STT, low confidence")) return this.say(s.unclear);
      if (this.phase === "opening" && s.no.test(text)) {
        this.phase = "loan";
        return this.call("check_loan_eligibility", {});
      }
      if (this.phase === "opening" && s.yesReminder.test(text)) {
        this.phase = "reminder";
        return this.call("compliance_check", { action: "send_reminder", customer_id: s.reminderCustomerId });
      }
      if (this.phase === "loan" && s.no.test(text)) {
        this.phase = "close";
        return this.say(s.declined);
      }
      if (this.phase === "loan" && s.yesLoan.test(text)) {
        return this.call("compliance_check", { action: "offer_loan", merchant_consented: true, amount: s.loanAmount });
      }
      if ((this.phase === "close" || this.phase === "loan") && s.bye.test(text)) {
        this.phase = "close";
        return this.call("end_call", { reason: "merchant done" });
      }
      return this.say(s.unclear);
    }
    // Tool result continuations.
    if (lastTool === "compliance_check" && this.phase === "reminder") return this.call("send_reminder", { customer_id: s.reminderCustomerId, compliance_ticket: ticketFrom(last) });
    if (lastTool === "send_reminder") return this.call("check_loan_eligibility", {});
    if (lastTool === "check_loan_eligibility") {
      this.phase = "loan";
      return this.say(s.afterReminder);
    }
    if (lastTool === "compliance_check" && this.phase === "loan") return this.call("offer_loan", { amount: s.loanAmount, merchant_consented: true, compliance_ticket: ticketFrom(last) });
    if (lastTool === "offer_loan") {
      this.phase = "close";
      return this.say(s.afterLoan);
    }
    if (lastTool === "end_call") return this.say(s.goodbye);
    return this.say(s.unclear);
  }
}

function ticketFrom(msg: ChatMessage): string | undefined {
  if (msg.role !== "tool") return undefined;
  try {
    return (JSON.parse(msg.content) as { ticketId?: string }).ticketId;
  } catch {
    return undefined;
  }
}
