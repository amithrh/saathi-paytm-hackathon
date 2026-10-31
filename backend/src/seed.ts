import type { Consent, CreditHistory, Counters, Device, Language, Merchant, SeasonalMonth, Settlement, Transaction, TxnChannel, UdhaarEntry } from "../../shared/types.js";
import { addDays, istInstant } from "./clock.js";
import { Rng } from "./rng.js";

export const RAVI_ID = "m001";
export const LAKSHMI_ID = "m002";
export const SEED = 20261031;

const AREAS = [
  "Koramangala", "Indiranagar", "Malleshwaram", "HSR Layout", "Whitefield", "BTM Layout", "Rajajinagar",
  "Yelahanka", "Marathahalli", "JP Nagar", "Banashankari", "Hebbal", "Vijayanagar", "KR Puram",
  "Electronic City", "Bommanahalli", "Frazer Town", "Shivajinagar",
];
const CATEGORIES = [
  "Kirana", "Medical store", "Bakery", "Tea stall", "Hardware", "Mobile accessories", "Saree shop",
  "Stationery", "Vegetable vendor", "Salon",
];
const OWNERS: Array<[string, Language]> = [
  ["Manjula R", "kn-IN"], ["Imtiaz Ahmed", "hi-IN"], ["Prakash Shetty", "kn-IN"], ["Sunita Devi", "hi-IN"],
  ["Nagaraj H", "kn-IN"], ["Mohan Yadav", "hi-IN"], ["Shalini Gowda", "kn-IN"], ["Rakesh Verma", "hi-IN"],
  ["Basavaraj K", "kn-IN"], ["Pooja Sharma", "hi-IN"], ["Venkatesh Murthy", "kn-IN"], ["Anil Gupta", "hi-IN"],
  ["Geetha N", "kn-IN"], ["Farhan Khan", "hi-IN"], ["Kiran Kumar", "kn-IN"], ["Rekha Singh", "hi-IN"],
  ["Suresh Babu", "kn-IN"], ["Deepak Jha", "hi-IN"],
];
const CUSTOMER_NAMES = ["Ramesh", "Kavitha", "Abdul", "Nandini", "Prasad", "Divya", "Girish", "Fatima", "Harish", "Lalitha", "Santosh", "Bhavana"];
const ITEMS = ["rice, dal, oil", "milk, bread, eggs", "sugar, tea, biscuits", "soap, detergent", "atta, ghee", "vegetables", "snacks, cold drinks"];

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function fullConsent(on: string): Consent {
  return { serviceCalls: true, promotionalCalls: true, udhaarReminders: true, whatsapp: true, consentedOn: on };
}

interface TxnGenOpts {
  rng: Rng;
  merchantIdx: number;
  today: string;
  days: number;
  dailyCount: [number, number];
  amountRange: [number, number];
  channels: TxnChannel[];
}

function genTransactions(o: TxnGenOpts): Transaction[] {
  const out: Transaction[] = [];
  let n = 0;
  for (let d = o.days; d >= 0; d--) {
    const date = addDays(o.today, -d);
    const count = o.rng.int(o.dailyCount[0], o.dailyCount[1]);
    const minutes: number[] = [];
    for (let i = 0; i < count; i++) {
      // Busy mornings (7-11) and evenings (17-21), quiet afternoons.
      const slot = o.rng.next();
      const hour = slot < 0.35 ? o.rng.int(7, 11) : slot < 0.55 ? o.rng.int(12, 16) : o.rng.int(17, 21);
      minutes.push(hour * 60 + o.rng.int(0, 59));
    }
    minutes.sort((a, b) => a - b);
    for (const m of minutes) {
      n++;
      const amount = Math.round(o.amountRange[0] + Math.pow(o.rng.next(), 2) * (o.amountRange[1] - o.amountRange[0]));
      out.push({
        id: `T${pad(o.merchantIdx, 3)}-${pad(n, 5)}`,
        at: istInstant(date, Math.floor(m / 60), m % 60).toISOString(),
        amount: Math.max(10, Math.round(amount / 5) * 5),
        channel: o.rng.pick(o.channels),
        status: o.rng.chance(0.02) ? "failed" : "success",
      });
    }
  }
  return out;
}

/** Scale one IST day's successful transactions so they sum to exactly `target`. */
function pinDayTotal(txns: Transaction[], date: string, target: number): void {
  const day = txns.filter((t) => t.status === "success" && t.at >= istInstant(date, 0).toISOString() && t.at < istInstant(addDays(date, 1), 0).toISOString());
  if (day.length === 0) throw new Error(`no transactions on ${date}`);
  const sum = day.reduce((s, t) => s + t.amount, 0);
  const factor = target / sum;
  let running = 0;
  for (const t of day) {
    t.amount = Math.max(5, Math.round(t.amount * factor));
    running += t.amount;
  }
  const last = day[day.length - 1]!;
  last.amount += target - running;
  if (last.amount <= 0) throw new Error(`cannot pin ${date} to ${target}`);
}

function genSettlements(rng: Rng, merchantIdx: number, today: string, txns: Transaction[], failedYesterday: boolean, failedAmount?: number): Settlement[] {
  const out: Settlement[] = [];
  for (let d = 7; d >= 1; d--) {
    const date = addDays(today, -d);
    const dayDigital = txns
      .filter((t) => t.status === "success" && t.channel !== "cash" && t.at >= istInstant(date, 0).toISOString() && t.at < istInstant(addDays(date, 1), 0).toISOString())
      .reduce((s, t) => s + t.amount, 0);
    const amount = failedYesterday && d === 1 && failedAmount ? failedAmount : dayDigital;
    const id = `S${pad(merchantIdx, 3)}-${date.replace(/-/g, "")}`;
    if (failedYesterday && d === 1) {
      out.push({ id, date, amount, status: "failed", failureReason: "Beneficiary bank timeout: UTR not generated (NPCI RC 91)" });
    } else {
      out.push({ id, date, amount, status: "settled", bankRef: `UTR${rng.int(100000000000, 999999999999)}` });
    }
  }
  return out;
}

function genSeasonal(rng: Rng, baseMonthly: number, festiveLift: number, lastYear: number): SeasonalMonth[] {
  const out: SeasonalMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const lift = m === 10 ? festiveLift * 0.8 : m === 11 ? festiveLift : m === 8 ? 0.08 : 0;
    const noise = 1 + (rng.next() - 0.5) * 0.08;
    out.push({ month: `${lastYear}-${pad(m, 2)}`, total: Math.round((baseMonthly * (1 + lift) * noise) / 500) * 500 });
  }
  return out;
}

function soundbox(id: string, status: Device["status"], heartbeat: string, events: Device["events"]): Device {
  return { id, type: "soundbox", model: "Soundbox Gen 3 (4G)", status, lastHeartbeat: heartbeat, events };
}

function qr(id: string, heartbeat: string): Device {
  return { id, type: "qr", model: "Static QR standee", status: "online", lastHeartbeat: heartbeat, events: [] };
}

function buildRavi(rng: Rng, today: string): Merchant {
  const yesterday = addDays(today, -1);
  const txns = genTransactions({ rng, merchantIdx: 1, today, days: 30, dailyCount: [38, 52], amountRange: [20, 900], channels: ["upi_qr", "soundbox", "soundbox", "upi_qr", "cash"] });
  pinDayTotal(txns, yesterday, 14200);
  const offlineSince = istInstant(yesterday, 18, 2).toISOString();
  const udhaar: UdhaarEntry[] = [
    { customerId: "c-suresh", customerName: "Suresh", customerPhone: "+91 98860 11201", customerDnd: false, amount: 2300, since: addDays(today, -12), items: "atta, oil, sugar, soap", status: "outstanding" },
    { customerId: "c-imran", customerName: "Imran", customerPhone: "+91 98860 11202", customerDnd: false, amount: 1150, since: addDays(today, -8), items: "rice, dal", status: "outstanding" },
    { customerId: "c-meena", customerName: "Meena", customerPhone: "+91 98860 11203", customerDnd: true, amount: 650, since: addDays(today, -4), items: "milk, biscuits", status: "outstanding" },
  ];
  return {
    id: RAVI_ID,
    mid: "PTM-JAY-00117",
    ownerName: "Ravi Kumar",
    shopName: "Ravi Kirana Store",
    category: "Kirana",
    area: "Jayanagar 4th Block",
    city: "Bengaluru",
    language: "hi-IN",
    phone: "+91 98450 11223",
    consent: fullConsent("2026-04-12"),
    dndRegistered: false,
    devices: [
      soundbox("SB-7F42", "offline", offlineSince, [
        { at: offlineSince, kind: "offline", note: "Silent since 18:02 IST (4G drop). 7 payments landed in the app unannounced; customers heard nothing and may have thought the payment failed", unconfirmed: { count: 7, amount: 1340 } },
      ]),
      qr("QR-2210", istInstant(today, 7, 55).toISOString()),
    ],
    settlements: genSettlements(rng, 1, today, txns, false),
    udhaar,
    transactions: txns,
    seasonalLastYear: genSeasonal(rng, 320000, 0.42, Number(today.slice(0, 4)) - 1),
    loanProfile: { creditScore: 742, existingLoan: false, monthsOnPaytm: 38 },
    creditHistory: { settlementDays90: 90, settlementsOnTime90: 82, uptimePct30: 90, udhaarRecoveredPct: 58, priorLoans: 0, priorLoansOnTime: 0 },
    loanOffers: [],
    weekSoFar: { recovered: 2110, collected: 1500, offered: 0, ticketsAvoided: 2 },
  };
}

function buildLakshmi(rng: Rng, today: string): Merchant {
  const yesterday = addDays(today, -1);
  const txns = genTransactions({ rng, merchantIdx: 2, today, days: 30, dailyCount: [30, 44], amountRange: [20, 700], channels: ["upi_qr", "soundbox", "soundbox", "cash"] });
  pinDayTotal(txns, yesterday, 11650);
  const udhaar: UdhaarEntry[] = [
    { customerId: "c-manjunath", customerName: "Manjunath", customerPhone: "+91 99720 33401", customerDnd: false, amount: 1800, since: addDays(today, -15), items: "rice, toor dal, oil", status: "outstanding" },
    { customerId: "c-shobha", customerName: "Shobha", customerPhone: "+91 99720 33402", customerDnd: false, amount: 420, since: addDays(today, -3), items: "milk, curd", status: "outstanding" },
  ];
  return {
    id: LAKSHMI_ID,
    mid: "PTM-BSK-00231",
    ownerName: "Lakshmi Devi",
    shopName: "Lakshmi Provision Stores",
    category: "Kirana",
    area: "Basavanagudi",
    city: "Bengaluru",
    language: "kn-IN",
    phone: "+91 99000 44556",
    consent: fullConsent("2026-02-03"),
    dndRegistered: false,
    devices: [
      soundbox("SB-91C0", "online", istInstant(today, 8, 1).toISOString(), []),
      qr("QR-5531", istInstant(today, 8, 0).toISOString()),
    ],
    settlements: genSettlements(rng, 2, today, txns, true, 8450),
    udhaar,
    transactions: txns,
    seasonalLastYear: genSeasonal(rng, 265000, 0.35, Number(today.slice(0, 4)) - 1),
    loanProfile: { creditScore: 731, existingLoan: false, monthsOnPaytm: 29 },
    creditHistory: { settlementDays90: 90, settlementsOnTime90: 84, uptimePct30: 97, udhaarRecoveredPct: 70, priorLoans: 0, priorLoansOnTime: 0 },
    loanOffers: [],
    weekSoFar: { recovered: 0, collected: 800, offered: 0, ticketsAvoided: 1 },
  };
}

function buildOther(rng: Rng, idx: number, today: string): Merchant {
  const [owner, language] = OWNERS[(idx - 3) % OWNERS.length]!;
  const category = CATEGORIES[(idx - 3) % CATEGORIES.length]!;
  const area = AREAS[(idx - 3) % AREAS.length]!;
  const txns = genTransactions({ rng, merchantIdx: idx, today, days: 30, dailyCount: [12, 60], amountRange: [15, 1200], channels: ["upi_qr", "soundbox", "card", "cash"] });
  const deviceOffline = rng.chance(0.3);
  const failedSettlement = rng.chance(0.25);
  const heartbeat = deviceOffline ? istInstant(addDays(today, -1), rng.int(9, 20), rng.int(0, 59)).toISOString() : istInstant(today, 8, rng.int(0, 30)).toISOString();
  const devices: Device[] = [
    soundbox(`SB-${pad(idx, 2)}A${rng.int(10, 99)}`, deviceOffline ? "offline" : "online", heartbeat,
      deviceOffline ? [{ at: heartbeat, kind: "offline", note: "Heartbeat lost", unconfirmed: { count: rng.int(1, 6), amount: rng.int(80, 900) } }] : []),
  ];
  const udhaar: UdhaarEntry[] = [];
  const nUdhaar = rng.int(1, 4);
  for (let i = 0; i < nUdhaar; i++) {
    const name = rng.pick(CUSTOMER_NAMES);
    udhaar.push({
      customerId: `c-${name.toLowerCase()}-${idx}-${i}`,
      customerName: name,
      customerPhone: `+91 9${rng.int(1000, 9999)} ${rng.int(10000, 99999)}`,
      customerDnd: rng.chance(0.2),
      amount: rng.int(3, 60) * 50,
      since: addDays(today, -rng.int(1, 25)),
      items: rng.pick(ITEMS),
      status: "outstanding",
    });
  }
  const consent = fullConsent(addDays(today, -rng.int(30, 400)));
  if (idx === 7) consent.promotionalCalls = false; // for refusal tests
  if (idx === 9) consent.udhaarReminders = false;
  const dndRegistered = idx === 11;
  return {
    id: `m${pad(idx, 3)}`,
    mid: `PTM-${area.slice(0, 3).toUpperCase()}-${pad(100 + idx * 7, 5)}`,
    ownerName: owner,
    shopName: `${owner.split(" ")[0]} ${category === "Kirana" ? "Stores" : category}`,
    category,
    area,
    city: "Bengaluru",
    language,
    phone: `+91 9${rng.int(1000, 9999)} ${rng.int(10000, 99999)}`,
    consent,
    dndRegistered,
    devices,
    settlements: genSettlements(rng, idx, today, txns, failedSettlement, failedSettlement ? rng.int(20, 180) * 50 : undefined),
    udhaar,
    transactions: txns,
    seasonalLastYear: genSeasonal(rng, rng.int(80, 500) * 1000, rng.next() * 0.5, Number(today.slice(0, 4)) - 1),
    loanProfile: { creditScore: rng.int(600, 800), existingLoan: rng.chance(0.3), monthsOnPaytm: rng.int(3, 60) },
    creditHistory: creditHistoryFor(idx),
    loanOffers: [],
    weekSoFar: { recovered: rng.int(0, 60) * 50, collected: rng.int(0, 40) * 50, offered: 0, ticketsAvoided: rng.int(0, 3) } as Counters,
  };
}

/** Own RNG per merchant so adding this history does not shift any other seeded value. */
function creditHistoryFor(idx: number): CreditHistory {
  const r = new Rng(SEED * 31 + idx * 7919);
  const priorLoans = r.int(0, 3);
  return {
    settlementDays90: 90,
    settlementsOnTime90: r.int(70, 90),
    uptimePct30: r.int(82, 99),
    udhaarRecoveredPct: r.int(40, 90),
    priorLoans,
    priorLoansOnTime: priorLoans ? r.int(Math.max(0, priorLoans - 1), priorLoans) : 0,
  };
}

/** The ten merchants on the fleet view. Ravi and Lakshmi plus eight calm neighbours. */
export const FLEET_IDS = ["m001", "m002", "m003", "m004", "m005", "m006", "m008", "m010", "m012", "m014"] as const;
/** The fleet merchant shown as "not yet" for credit, so the audience sees a refusal. */
export const NOT_YET_ID = "m006";

/** Twenty merchants, deterministic for a given `today` (IST YYYY-MM-DD). */
export function buildMerchants(today: string, seed = SEED): Merchant[] {
  const rng = new Rng(seed);
  const out: Merchant[] = [buildRavi(rng, today), buildLakshmi(rng, today)];
  for (let i = 3; i <= 20; i++) out.push(buildOther(rng, i, today));
  // Fleet neighbours open calm: devices heartbeating, settlements credited. The fleet scene injects incidents live.
  for (const m of out) {
    if (!(FLEET_IDS as readonly string[]).includes(m.id) || m.id === "m001" || m.id === "m002") continue;
    for (const d of m.devices) {
      d.status = "online";
      d.events = [];
      d.lastHeartbeat = istInstant(today, 8, 5).toISOString();
    }
    for (const st of m.settlements) {
      if (st.status !== "settled") {
        st.status = "settled";
        st.bankRef = `UTR${String(st.amount).padStart(6, "0")}${st.date.replace(/-/g, "")}`;
        delete st.failureReason;
      }
    }
  }
  const weak = out.find((m) => m.id === NOT_YET_ID);
  if (weak) {
    weak.creditHistory = { settlementDays90: 90, settlementsOnTime90: 50, uptimePct30: 78, udhaarRecoveredPct: 25, priorLoans: 2, priorLoansOnTime: 0 };
    weak.loanProfile.existingLoan = false;
  }
  return out;
}
