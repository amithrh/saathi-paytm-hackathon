import type { Language } from "../../shared/types.js";

/** The judge's lines for the 90-second demo, per language, in the order Saathi expects them. */
export const JUDGE_LINES: Record<Language, string[]> = {
  "hi-IN": [
    "हाँ, सुरेश को रिमाइंडर भेजो।",
    "हाँ, लोन चाहिए, आगे बढ़ो।",
    "ठीक है, धन्यवाद।",
  ],
  "kn-IN": [
    "ಹೌದು, ಮಂಜುನಾಥ್‌ಗೆ ರಿಮೈಂಡರ್ ಕಳಿಸಿ.",
    "ಹೌದು, ಲೋನ್ ಬೇಕು, ಮುಂದುವರಿಸಿ.",
    "ಸರಿ, ಧನ್ಯವಾದಗಳು.",
  ],
};
