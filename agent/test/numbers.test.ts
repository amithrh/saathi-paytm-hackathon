import { describe, expect, it } from "vitest";
import { auditSpokenNumbers, numbersInResult, spokenAmounts } from "../src/numbers.js";

describe("spoken-number audit", () => {
  it("extracts rupee-sized integers from Hindi and Kannada speech, ignoring small counts and dates", () => {
    expect(spokenAmounts("कल 14200 रुपये आए, 50 पेमेंट। सुरेश का 2300 रुपये 12 दिन से बाकी है। दिवाली 2026-11-08 को है।")).toEqual([14200, 2300]);
    expect(spokenAmounts("ನಿಮಗೆ 30000 ರೂಪಾಯಿ ಲೋನ್, ತಿಂಗಳಿಗೆ 5450 ರೂಪಾಯಿ, 18% ಬಡ್ಡಿ")).toEqual([30000, 5450]);
    expect(spokenAmounts("₹1,340 and 9,080 and 1,00,000")).toEqual([1340, 9080, 100000]);
  });

  it("collects numbers from nested tool results including numeric strings", () => {
    const set = numbersInResult({ yesterday: { total: 14200, payments: 50 }, udhaar: [{ amount: 2300, days: 12 }], note: "Rs 1,340 confirmed", rate: 18 });
    expect([...set].sort((a, b) => a - b)).toEqual([12, 18, 50, 1340, 2300, 14200]);
  });

  it("flags a spoken amount that no tool returned", () => {
    const backing = numbersInResult({ max_amount: 50000, approx_monthly_repayment: 9080 });
    expect(auditSpokenNumbers("आप 50000 रुपये तक ले सकते हैं, किस्त 9080 रुपये", backing)).toEqual({ spoken: [50000, 9080], unbacked: [] });
    expect(auditSpokenNumbers("किस्त लगभग 8900 रुपये बनेगी", backing)).toEqual({ spoken: [8900], unbacked: [8900] });
  });
});
