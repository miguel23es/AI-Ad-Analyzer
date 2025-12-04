// 1) Load env vars
import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });

// 2) Imports (ESM-style)
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

// 3) __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 4) App init
const app = express();

// 5) Middleware
app.use(cors());
app.use(express.json());

// 6) Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));

// 7) Root -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 8) OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
====================================================
HELPERS
====================================================
*/


import Tesseract from "tesseract.js";

async function extractTextFromImage(imageBuffer) {
  console.log("🟩 Running Tesseract OCR...");

  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBuffer,
      'eng',
      {
        logger: m => console.log("📘 OCR Progress:", m)
      }
    );

    console.log("🟩 OCR RESULT:", text);
    return text;
  } catch (err) {
    console.error("🔥 Tesseract OCR Error:", err);
    return "";
  }
}

/*
====================================================
CLICK GOAL ("clicks")
Drive traffic / get people to tap
====================================================
*/

// Shared helpers for more generous scoring
function generousNormalize(raw) {
  // 0 -> 0, 1 -> 70, 2 -> 90, 3+ -> 100
  if (raw <= 0) return 0;
  if (raw === 1) return 70;
  if (raw === 2) return 90;
  return 100;
}

function dimensionBonus(nonZeroDims) {
  // Small bonus for hitting multiple angles
  if (nonZeroDims >= 3) return 12; // very well-rounded
  if (nonZeroDims === 2) return 8; // solid
  if (nonZeroDims === 1) return 4; // at least one strong angle
  return 0;
}

function clampScore(score) {
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}


function scoreForClicks(adText) {
  const text = adText.toLowerCase();

  const CTA_WORDS = [
    // Direct actions
    "click", "tap", "press", "hit the button",
    "learn more", "find out more", "see how", "check it out",
    "discover", "explore", "read more",

    // Signup / join
    "sign up", "signup", "register", "join now", "join today",
    "create your account", "get access", "get instant access",

    // Start / try
    "get started", "start now", "start today",
    "try it", "try it now", "try for free", "start free",
    "start your free trial", "free trial",

    // Buying / booking
    "shop now", "buy now", "purchase now", "order now",
    "add to cart", "grab yours", "claim yours",
    "book now", "reserve now", "reserve your spot",

    // Download
    "download", "download now", "get the app", "install now",
  ];

  const URGENCY_PATTERNS = [
    "limited time", "last chance", "ending soon", "ends today",
    "ends tonight", "today only", "only today",
    "while supplies last", "before it's gone",
    "don't miss out", "hurry", "act now",

    // Regex (softer, more flexible)
    /only\s+(today|tonight|this week|for a limited time)/i,
    /ends?\s+(today|tonight|soon|this week)/i,
    /hurry|act now|don'?t wait/i,
    /(few|limited)\s+(spots|units|items|left)/i,
    /before\s+(it'?s|its)\s+gone/i,
  ];

  const CURIOSITY_PATTERNS = [
    "secret", "secrets revealed",
    "you won't believe", "what no one tells you",
    "nobody talks about", "they don't want you to know",
    "the truth about", "the real reason",
    "hidden", "revealed", "exposed",
    "discover how", "find out why",

    // Regex curiosity hooks
    /you\s+won'?t\s+believe/i,
    /the\s+truth\s+about/i,
    /what\s+(no one|nobody)\s+(tells|talks)\s+you/i,
    /this\s+is\s+why/i,
    /how\s+to\s+\w+/i,
  ];


function countHits(patterns, text) {
  return patterns.reduce((count, item) => {
    if (typeof item === "string") {
      return text.includes(item) ? count + 1 : count;
    }
    if (item instanceof RegExp) {
      return item.test(text) ? count + 1 : count;
    }
    return count;
  }, 0);
}


  const ctaScore = countHits(CTA_WORDS, text);
  const urgencyScore = countHits(URGENCY_PATTERNS, text);
  const curiosityScore = countHits(CURIOSITY_PATTERNS, text);


  const ctaNorm = generousNormalize(ctaScore);
  const urgencyNorm = generousNormalize(urgencyScore);
  const curiosityNorm = generousNormalize(curiosityScore);

  const nonZeroDims =
    (ctaScore > 0 ? 1 : 0) +
    (urgencyScore > 0 ? 1 : 0) +
    (curiosityScore > 0 ? 1 : 0);

  const baseScore =
    ctaNorm * 0.4 + urgencyNorm * 0.3 + curiosityNorm * 0.3;

  let finalScore = baseScore + dimensionBonus(nonZeroDims);

  // If there is at least some “click” structure, don't be brutally low
  const anyHit = ctaScore + urgencyScore + curiosityScore > 0;
  if (anyHit && finalScore < 40) {
    finalScore = 40;
  }

  finalScore = clampScore(finalScore);

  return {
    finalScore,
    breakdown: {
      CTA: ctaNorm,
      Urgency: urgencyNorm,
      Curiosity: curiosityNorm,
    },
    details: {
      ctaScore,
      urgencyScore,
      curiosityScore,
    },
  };
}


function generateFeedbackClicks(result) {
  const tips = [];

  if (result.details.ctaScore === 0) {
    tips.push(
      "Add a direct call to action like 'Tap to learn more', 'Sign up now', or 'Get started'."
    );
  }

  if (result.details.urgencyScore === 0) {
    tips.push(
      "Add urgency to push immediate action. Example: 'Limited time offer', 'Ends today', 'Only a few left'."
    );
  }

  if (result.details.curiosityScore === 0) {
    tips.push(
      "Add curiosity to earn the click. Example: 'You won't believe this...', 'What nobody tells you...', 'The secret they don't want you to know...'."
    );
  }

  if (tips.length === 0) {
    tips.push(
      "Strong click-focused ad. You use CTA, urgency, and curiosity to drive high click-through."
    );
  }

  return tips;
}

/*
====================================================
CONVERSIONS GOAL ("conversions")
Get a sale / signup
====================================================
*/

function scoreForConversions(adText) {
  const text = adText.toLowerCase();

  const BENEFIT_PATTERNS = [
    "save time", "save money", "cut costs",
    "grow your business", "boost results", "increase revenue",
    "get results", "see results", "proven results",
    "faster", "easier", "simpler",
    "stress-free", "hassle-free",
    "feel better", "look better", "perform better",
    "more efficient", "high quality", "reliable",

    // Regex benefits
    /save\s+(time|money)/i,
    /boost\s+(performance|results|sales)/i,
    /increase\s+(sales|revenue|growth)/i,
    /get\s+results/i,
    /(without|no)\s+(stress|hassle)/i,
  ];


  const PROOF_PATTERNS = [
    "trusted by", "used by", "recommended by",
    "5-star", "five star", "★★★★★",
    "top rated", "highly rated",
    "award-winning", "industry-leading",
    "proven", "testimonials", "reviews",
    "experts agree", "backed by experts",

    // Numbers & credibility
    /\d{1,3},?\d*\+\s+(customers|users|businesses)/i,
    /\d+\s*\+?\s*years?\s+(experience|trusted)/i,
    /(featured|as seen)\s+in/i,
  ];


  const OFFER_PATTERNS = [
    "free trial", "free demo", "free consultation",
    "money-back guarantee", "satisfaction guaranteed",
    "risk-free", "no risk",
    "discount", "special offer", "exclusive offer",
    "limited-time offer",
    "% off", "percent off",
    "no commitment", "cancel anytime",

    // Regex offers
    /\d+\s*%\s*off/i,
    /(free|complimentary)\s+(trial|demo|consultation)/i,
    /money\s+back\s+guarantee/i,
    /risk\s*free/i,
    /(today|this week)\s+only/i,
  ];


  function countHits(patterns, text) {
    return patterns.reduce((count, item) => {
      if (typeof item === "string") {
        return text.includes(item) ? count + 1 : count;
      }
      if (item instanceof RegExp) {
        return item.test(text) ? count + 1 : count;
      }
      return count;
    }, 0);
  }


  const benefitScore = countHits(BENEFIT_PATTERNS, text);
  const proofScore = countHits(PROOF_PATTERNS, text);
  const offerScore = countHits(OFFER_PATTERNS, text);

  const benefitNorm = generousNormalize(benefitScore);
  const proofNorm = generousNormalize(proofScore);
  const offerNorm = generousNormalize(offerScore);

  const nonZeroDims =
    (benefitScore > 0 ? 1 : 0) +
    (proofScore > 0 ? 1 : 0) +
    (offerScore > 0 ? 1 : 0);

  const baseScore =
    offerNorm * 0.4 + proofNorm * 0.3 + benefitNorm * 0.3;

  let finalScore = baseScore + dimensionBonus(nonZeroDims);

  // If it at least looks like a legit conversion ad, be less harsh
  const anyHit = benefitScore + proofScore + offerScore > 0;
  if (anyHit && finalScore < 45) {
    finalScore = 45;
  }

  finalScore = clampScore(finalScore);

  return {
    finalScore,
    breakdown: {
      OfferIncentive: offerNorm,
      SocialProofTrust: proofNorm,
      BenefitClarity: benefitNorm,
    },
    details: {
      benefitScore,
      proofScore,
      offerScore,
    },
  };
}


function generateFeedbackConversions(result) {
  const tips = [];

  if (result.details.offerScore === 0) {
    tips.push(
      "Add an incentive or offer. Example: 'Start your free trial', '20% off today', 'Try it risk-free'. This pushes people to buy NOW."
    );
  }

  if (result.details.proofScore === 0) {
    tips.push(
      "Add social proof to build trust. Example: 'Trusted by 10,000+ customers', '5-star rated', 'Award-winning results'."
    );
  }

  if (result.details.benefitScore === 0) {
    tips.push(
      "Make the benefit obvious. Tell the user what THEY get: 'Sleep better in 7 days', 'Grow your business without extra work', 'Save $200 a month'."
    );
  }

  if (tips.length === 0) {
    tips.push(
      "Strong conversion copy. You communicate benefits, provide proof, and include an incentive to act."
    );
  }

  return tips;
}

/*
====================================================
AWARENESS GOAL ("awareness")
Brand voice / memorability
====================================================
*/

function scoreForAwareness(adText) {
  const text = adText.toLowerCase();

  const BRANDING_PATTERNS = [
    "we are", "we're", "our mission", "our vision",
    "who we are", "what we stand for",
    "introducing", "meet the", "this is",
    "official launch", "from the makers of",
    "built for", "designed for",
    "the future of",

    // Regex
    /(our|the)\s+(mission|vision|story)/i,
    /(introducing|meet)\s+the/i,
  ];

  const EMOTIONAL_PATTERNS = [
    "premium", "luxury", "exclusive",
    "bold", "fearless", "confident",
    "unforgettable", "iconic",
    "authentic", "timeless", "modern",
    "next-level", "redefining",
    "elevated", "powerful", "beautiful",

    // Regex emotion
    /(next|new)\s+level/i,
    /redefining\s+the/i,
    /crafted\s+for/i,
  ];


  function countHits(patterns, text) {
    return patterns.reduce((count, item) => {
      if (typeof item === "string") {
        return text.includes(item) ? count + 1 : count;
      }
      if (item instanceof RegExp) {
        return item.test(text) ? count + 1 : count;
      }
      return count;
    }, 0);
  }


  const brandingScore = countHits(BRANDING_PATTERNS, text);
  const emotionalScore = countHits(EMOTIONAL_PATTERNS, text);

  const wordCount = adText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // Softer, more realistic simplicity rule
  let simplicityNorm;
  if (wordCount <= 20) {
    simplicityNorm = 100;     // punchy
  } else if (wordCount <= 40) {
    simplicityNorm = 75;      // still fine
  } else if (wordCount <= 60) {
    simplicityNorm = 50;      // a bit long, but okay
  } else {
    simplicityNorm = 30;      // long, but not auto-zero
  }

  const brandingNorm = generousNormalize(brandingScore);
  const emotionalNorm = generousNormalize(emotionalScore);

  const nonZeroDims =
    (brandingScore > 0 ? 1 : 0) +
    (emotionalScore > 0 ? 1 : 0);

  const baseScore =
    brandingNorm * 0.4 +
    emotionalNorm * 0.3 +
    simplicityNorm * 0.3;

  let finalScore = baseScore + dimensionBonus(nonZeroDims);

  const anyHit = brandingScore + emotionalScore > 0;
  if (anyHit && finalScore < 40) {
    finalScore = 40;
  }

  finalScore = clampScore(finalScore);

  return {
    finalScore,
    breakdown: {
      BrandClarityIdentity: brandingNorm,
      EmotionalImpactTone: emotionalNorm,
      MemorabilitySimplicity: simplicityNorm,
    },
    details: {
      brandingScore,
      emotionalScore,
      wordCount,
    },
  };
}


function generateFeedbackAwareness(result) {
  const tips = [];

  if (result.details.brandingScore === 0) {
    tips.push(
      "Make the brand more explicit. Say who you are or what you stand for (e.g. 'Introducing ___', 'Our mission is ___')."
    );
  }

  if (result.details.emotionalScore === 0) {
    tips.push(
      "Use more emotional or identity-heavy language. Words like 'bold', 'fearless', 'premium', 'unforgettable' make the brand feel distinct."
    );
  }

  if (result.details.wordCount > 30) {
    tips.push(
      "Shorten the message. Awareness ads should be punchy and easy to remember. Aim for one clear sentence or tagline."
    );
  }

  if (tips.length === 0) {
    tips.push(
      "Strong awareness copy. Message is emotionally memorable, clearly tied to brand identity, and easy to remember."
    );
  }

  return tips;
}


/*
====================================================
REAL LLM CALL
We send goal + ad + numeric breakdown to GPT-4o-mini and ask
for aiSummary + rewrite in JSON.
====================================================
*/

async function generateLLMAnalysis({ adText, goal, score, breakdown }) {
  const prompt = `
You are an expert paid ads strategist. Your job is to evaluate ads for a specific campaign goal and then improve them.

GOAL: ${goal}
ORIGINAL_AD_TEXT: """${adText}"""

NUMERICAL_SCORE_FOR_THIS_GOAL: ${score} / 100
SCORE_BREAKDOWN (0-100 each):
${JSON.stringify(breakdown, null, 2)}

TASKS:
1. Give a short honest performance review for this ad *for this goal*. Mention what's working and what's missing.
2. Give the top 2-3 fixes that would most improve performance.
3. Write a stronger revised version of the ad that's under 30 words, punchy, and does not invent fake numbers or fake guarantees.

Return ONLY valid JSON:
{
  "aiSummary": "...human readable analysis + top fixes...",
  "rewrite": "...short improved ad copy under 30 words..."
}
`;


  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You are a honest performance marketing strategist. Be direct, practical, and conversion-minded.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(raw);
    return {
      aiSummary: parsed.aiSummary || raw,
      rewrite: parsed.rewrite || "",
    };
  } catch (err) {
    // fallback: model didn't give valid JSON, just return raw text
    return {
      aiSummary: raw,
      rewrite: "",
    };
  }
}

async function generateLLMScore({ adText, goal }) {
  const prompt = `
You are an expert performance marketer evaluating ads.

Your job:
- Evaluate the ad text for the specified GOAL.
- Give an overall score from 0 to 100 (0 = terrible, 100 = world-class).
- Give a breakdown of 3 sub-dimensions as 0–100 scores.

GOAL: ${goal}
AD_TEXT: """${adText}"""

Use these breakdown keys depending on the goal:

- If GOAL is "clicks":
  - CTA
  - Urgency
  - Curiosity

- If GOAL is "conversions":
  - Offer / Incentive
  - Benefit / Clarity
  - Social Proof / Trust

- If GOAL is "awareness":
  - Brand / Clarity / Identity
  - Emotional Impact / Tone
  - Memorability / Simplicity

Guidelines:
- Be realistic but slightly generous. A decent ad should usually be between 60 and 85.
- Consider meaning and tone, not just specific buzzwords or exact phrases.
- If the style is unusual but clearly strong for the goal, score it fairly.

Return ONLY valid JSON like:
{
  "finalScore": number,
  "breakdown": {
    // 3 keys depending on GOAL, each 0-100
  }
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a precise performance marketing rater. Always answer with strict JSON only, no extra text.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(raw);
    return {
      finalScore: typeof parsed.finalScore === "number" ? parsed.finalScore : 0,
      breakdown: typeof parsed.breakdown === "object" ? parsed.breakdown : {},
      _raw: raw,
    };
  } catch (err) {
    // If JSON parsing fails, fail gracefully
    console.error("generateLLMScore JSON parse error:", err, raw);
    return {
      finalScore: 0,
      breakdown: {},
      _raw: raw,
    };
  }
}


/*
====================================================
ROUTES
====================================================
*/

app.get("/", (req, res) => {
  res.json({ message: "Ad Analyzer backend is running ✅" });
});

// IMPORTANT: this route is async because we call the LLM
// IMPORTANT: this route is async because we call the LLM
app.post("/analyzeAd", upload.single("imageFile"), async (req, res, next) => {
  try {
    console.log("🟦 Received request");
    console.log("body:", req.body);
    console.log("file:", req.file);

    console.log("🟩 Checking if OCR will run...");
    console.log("req.file exists?", !!req.file);

    // 1️⃣ Extract OCR text FIRST
    let ocrText = "";
    if (req.file) {
      console.log("🟩 Starting OCR...");
      try {
        ocrText = await extractTextFromImage(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname // <-- send filename too
        );
        console.log("🟩 OCR TEXT RESULT:", ocrText);
      } catch (err) {
        console.error("🔥 OCR ERROR:", err);
      }
    }

    // 2️⃣ Merge user input + OCR text
    const adText = req.body.adText || "";
    const fullAdText = `${adText} ${ocrText}`.trim();

    console.log("🟩 FULL AD TEXT FOR ANALYSIS:", fullAdText);

    const goal = req.body.goal;

    // 3️⃣ Local rule-based scoring (still part of the project, not just OpenAI)
    let localResult;
    if (goal === "clicks") {
      localResult = scoreForClicks(fullAdText);
    } else if (goal === "conversions") {
      localResult = scoreForConversions(fullAdText);
    } else if (goal === "awareness") {
      localResult = scoreForAwareness(fullAdText);
    } else {
      localResult = {
        finalScore: 0,
        breakdown: {},
        details: {},
      };
    }

    // 4️⃣ AI-based scoring (semantic, bigger “word pool”)
    const aiResult = await generateLLMScore({
      adText: fullAdText,
      goal,
    });
    // aiResult: { finalScore, breakdown }

    // 5️⃣ Blend local + AI so you’re not fully relying on OpenAI
    const blendedScore = Math.round(
      (aiResult.finalScore || 0) * 0.9 +
      (localResult.finalScore || 0) * 0.1
    );

    const blendedBreakdown =
      aiResult.breakdown && Object.keys(aiResult.breakdown).length > 0
        ? aiResult.breakdown
        : localResult.breakdown || {};

    // 6️⃣ Generate human-friendly suggestions from your local logic
    let suggestions = [];
    if (goal === "clicks") {
      suggestions = generateFeedbackClicks(localResult);
    } else if (goal === "conversions") {
      suggestions = generateFeedbackConversions(localResult);
    } else if (goal === "awareness") {
      suggestions = generateFeedbackAwareness(localResult);
    }

    // 7️⃣ Call LLM for deeper analysis + rewrite, using blended score
    const llmSummary = await generateLLMAnalysis({
      adText: fullAdText,
      goal,
      score: blendedScore,
      breakdown: blendedBreakdown,
    });

    // 8️⃣ Respond
    res.json({
      goalAnalyzed: goal,

      // final numbers you actually show
      score: blendedScore,
      breakdown: blendedBreakdown,

      // debugging / transparency (you can hide these in UI if you want)
      localScore: localResult.finalScore,
      localBreakdown: localResult.breakdown,
      aiScore: aiResult.finalScore,
      aiBreakdown: aiResult.breakdown,

      // AI commentary
      aiSummary: llmSummary.aiSummary,
      rewrite: llmSummary.rewrite,

      // OCR + rule-based suggestions
      ocrText,
      suggestions,
    });
  } catch (err) {
    next(err);
  }
});



/*
====================================================
START SERVER
====================================================
*/

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err.stack);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
