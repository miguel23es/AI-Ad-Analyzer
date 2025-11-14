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

function interpretScore(score) {
  if (score >= 80) return "strong and close to ready to run";
  if (score >= 60) return "decent but still missing key elements";
  if (score >= 40)
    return "average and needs important improvements before running paid spend";
  return "weak and not aligned with the goal yet";
}

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

function scoreForClicks(adText) {
  const text = adText.toLowerCase();

  const ctaWords = [
    "click",
    "tap",
    "learn more",
    "sign up",
    "get started",
    "try it",
  ];

  const urgencyWords = [
    "now",
    "today",
    "limited time",
    "last chance",
    "ends tonight",
    "don't miss",
  ];

  const curiosityWords = [
    "secret",
    "you won't believe",
    "what no one tells you",
    "nobody talks about",
    "they don't want you to know",
  ];

  function countHits(list) {
    return list.reduce((count, phrase) => {
      if (text.includes(phrase)) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  const ctaScore = countHits(ctaWords);
  const urgencyScore = countHits(urgencyWords);
  const curiosityScore = countHits(curiosityWords);

  function normalize(raw) {
    const capped = raw > 2 ? 2 : raw;
    return (capped / 2) * 100; // 0 ->0, 1 ->50, 2+ ->100
  }

  const ctaNorm = normalize(ctaScore);
  const urgencyNorm = normalize(urgencyScore);
  const curiosityNorm = normalize(curiosityScore);

  const finalScore = Math.round(
    ctaNorm * 0.4 + urgencyNorm * 0.3 + curiosityNorm * 0.3
  );

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

  const benefitPatterns = [
    "save",
    "so you can",
    "get results",
    "improve",
    "feel better",
    "look better",
    "faster",
    "easier",
    "stress-free",
    "time-saving",
  ];

  const proofPatterns = [
    "trusted by",
    "5-star",
    "★★★★★",
    "10,000+",
    "thousands of customers",
    "proven",
    "award-winning",
    "backed by experts",
    "clinically tested",
  ];

  const offerPatterns = [
    "free trial",
    "free demo",
    "money-back guarantee",
    "% off",
    "off today",
    "discount",
    "risk-free",
    "no commitment",
    "limited-time offer",
  ];

  function countHits(list) {
    return list.reduce((count, phrase) => {
      if (text.includes(phrase)) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  const benefitScore = countHits(benefitPatterns);
  const proofScore = countHits(proofPatterns);
  const offerScore = countHits(offerPatterns);

  function normalize(raw) {
    const capped = raw > 2 ? 2 : raw;
    return (capped / 2) * 100;
  }

  const benefitNorm = normalize(benefitScore);
  const proofNorm = normalize(proofScore);
  const offerNorm = normalize(offerScore);

  const finalScore = Math.round(
    offerNorm * 0.4 + proofNorm * 0.3 + benefitNorm * 0.3
  );

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

  const brandingPatterns = [
    "we are",
    "we're",
    "our mission",
    "our vision",
    "introducing",
    "the new",
    "official",
    "experience",
    "this is us",
  ];

  const emotionalWords = [
    "premium",
    "luxury",
    "bold",
    "fearless",
    "unforgettable",
    "iconic",
    "elevate",
    "next-level",
    "redefining",
    "exclusive",
  ];

  function countHits(list) {
    return list.reduce((count, phrase) => {
      if (text.includes(phrase)) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  const brandingScore = countHits(brandingPatterns);
  const emotionalScore = countHits(emotionalWords);

  const wordCount = adText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  let simplicityNorm;
  if (wordCount <= 15) {
    simplicityNorm = 100;
  } else if (wordCount <= 30) {
    simplicityNorm = 50;
  } else {
    simplicityNorm = 0;
  }

  function normalize(raw) {
    const capped = raw > 2 ? 2 : raw;
    return (capped / 2) * 100;
  }

  const brandingNorm = normalize(brandingScore);
  const emotionalNorm = normalize(emotionalScore);

  const finalScore = Math.round(
    brandingNorm * 0.4 + emotionalNorm * 0.3 + simplicityNorm * 0.3
  );

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

const imgSignals = {
  hasPerson: false,
  hasProduct: false,
  hasOfferText: false
};


function analyzeImageForGoal(goal, imgSignals = {}) {
  const { hasPerson, hasProduct, hasOfferText } = imgSignals || {};

  if (goal === "awareness") {
    if (hasPerson && !hasOfferText) {
      return "Good for awareness: showing a real person helps create emotional connection. The image isn't cluttered with promo text, so the brand vibe is clear.";
    }
    if (!hasPerson) {
      return "For awareness, consider using a human or lifestyle shot. Faces and emotion help people remember the brand.";
    }
    return "Image is okay for awareness. Keep it clean, bold, and identity-focused instead of feeling like a coupon.";
  }

  if (goal === "clicks") {
    if (hasOfferText) {
      return "Great for clicks: bold promo text on the image grabs attention fast and can boost tap-through.";
    }
    return "To drive clicks, consider putting short bold text directly on the image (like 'FREE TRIAL TODAY'). That kind of visual hook stops the scroll.";
  }

  if (goal === "conversions") {
    if (hasProduct && hasOfferText) {
      return "Strong for conversions: the image shows the product and a clear offer. This helps people understand what they're buying and why to act now.";
    }
    if (!hasProduct) {
      return "For conversions, show the actual product or result in the image so buyers know what they're getting.";
    }
    if (!hasOfferText) {
      return "Consider adding a clear offer stamp on the image (e.g. '20% Off — Today Only'). That visual nudge can push last-second signups.";
    }
  }

  return "No image signals provided. (Optional: tell us if the image shows a person, the product, or promo text and we’ll evaluate it.)";
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
          "You are a brutally honest performance marketing strategist. Be direct, practical, and conversion-minded.",
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

/*
====================================================
ROUTES
====================================================
*/

app.get("/", (req, res) => {
  res.json({ message: "Ad Analyzer backend is running ✅" });
});

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
        req.file.originalname     // <-- send filename too
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

    // 3️⃣ Run your scoring engines using fullAdText
    let result;
    let suggestions;

    if (goal === "clicks") {
      result = scoreForClicks(fullAdText);
      suggestions = generateFeedbackClicks(result);
    } else if (goal === "conversions") {
      result = scoreForConversions(fullAdText);
      suggestions = generateFeedbackConversions(result);
    } else if (goal === "awareness") {
      result = scoreForAwareness(fullAdText);
      suggestions = generateFeedbackAwareness(result);
    } else {
      return res.json({ error: "Invalid goal" });
    }

    // 4️⃣ Call the LLM using fullAdText
    let llmSummary = await generateLLMAnalysis({
      adText: fullAdText,
      goal,
      score: result.finalScore,
      breakdown: result.breakdown
    });

    // 5️⃣ Respond
    res.json({
      goalAnalyzed: goal,
      score: result.finalScore,
      breakdown: result.breakdown,
      aiSummary: llmSummary.aiSummary,
      rewrite: llmSummary.rewrite,
      ocrText,
      suggestions
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
