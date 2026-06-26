import express from "express";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import os from "os";
import { createServer as createViteServer } from "vite";

const upload = multer({ dest: os.tmpdir() });

function cleanFileName(filename: string): string {
  if (!filename) return "";
  return filename
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/[_-]/g, " ") // replace underscores and dashes with spaces
    .trim();
}

function getGenAI(req: express.Request): GoogleGenAI {
  const customKey = req.headers['x-gemini-api-key'] as string;
  const key = (customKey && customKey.trim() !== "") ? customKey.trim() : process.env.GEMINI_API_KEY;
  
  if (!key || key.trim() === "") {
     throw new Error("Quota exceeded: GEMINI_API_KEY is not defined. Falling back.");
  }
  return new GoogleGenAI({ 
    apiKey: key,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

// Resilient helper to handle high-demand 503 errors and load spikes gracefully
async function generateContentWithRetryAndFallback(params: any, ai: GoogleGenAI): Promise<any> {
  const preferredModel = params.model;
  const fallbackModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const modelsToTry = preferredModel && !fallbackModels.includes(preferredModel)
    ? [preferredModel, ...fallbackModels]
    : fallbackModels;
  let lastError: any = null;

  for (const model of modelsToTry) {
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Gemini API] Requesting ${model} (attempt ${attempt}/${attempts})`);
        const response = await ai.models.generateContent({
          ...params,
          model: model, // enforce specific model
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = err.message || String(err);
        
        const isClientError = msg.includes("400") ||
          msg.toLowerCase().includes("invalid_argument") ||
          msg.toLowerCase().includes("no pages");

        if (isClientError) {
          console.warn(`[Gemini API] Permanent client-side error (400) on ${model}. Aborting further attempts:`, msg);
          throw err;
        }

        const isQuotaErr = msg.includes("429") ||
          msg.toLowerCase().includes("quota") ||
          msg.toLowerCase().includes("exhausted") ||
          msg.toLowerCase().includes("rate_limit") ||
          msg.toLowerCase().includes("rate limit");

        if (isQuotaErr) {
          console.log(`[Gemini API] Quota limit detected on ${model}. Transitioning to next fallback model if available.`);
          break; // Break the attempt loop to try the next model
        }

        const isUnavailableErr = msg.includes("503") ||
          msg.toLowerCase().includes("unavailable") ||
          msg.toLowerCase().includes("high demand") ||
          msg.toLowerCase().includes("service unavailable");

        if (isUnavailableErr) {
          console.log(`[Gemini API] High-demand 503/UNAVAILABLE detected on ${model}. Switching to another model in the pool immediately.`);
          break; // Break the attempt loop to try the next model
        }

        console.warn(`[Gemini API] Warning on ${model} (attempt ${attempt}/${attempts}):`, msg);
        if (attempt < attempts) {
          // Exponential backoff delay before retrying
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate content using all fallback models.");
}

// Utility to clean raw JSON string, escaping any invalid backslashes or malformed escape sequences
function cleanJsonString(str: string): string {
  let result = "";
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
    } else if (inString) {
      if (char === '\\') {
        if (i + 1 < str.length) {
          const nextChar = str[i + 1];
          if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'n') {
            result += char;
            result += nextChar;
            i += 2;
          } else if (nextChar === 'u') {
            let isHex = true;
            for (let h = 0; h < 4; h++) {
              const hChar = str[i + 2 + h];
              if (!hChar || !/[0-9a-fA-F]/.test(hChar)) {
                isHex = false;
                break;
              }
            }
            if (isHex) {
              result += char;
              result += 'u';
              for (let h = 0; h < 4; h++) {
                result += str[i + 2 + h];
              }
              i += 6;
            } else {
              result += "\\\\u";
              i += 2;
            }
          } else {
            result += "\\\\";
            result += nextChar;
            i += 2;
          }
        } else {
          result += "\\\\";
          i++;
        }
      } else if (char === '\n') {
        result += "\\n";
        i++;
      } else if (char === '\r') {
        result += "\\r";
        i++;
      } else if (char === '\t') {
        result += "\\t";
        i++;
      } else {
        const code = char.charCodeAt(0);
        if (code < 32) {
          const hex = code.toString(16).padStart(4, '0');
          result += "\\u" + hex;
        } else {
          result += char;
        }
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result.replace(/,\s*([\}\]])/g, "$1");
}

// Robust JSON parser with advanced healing capabilities for handling truncated outputs
function robustJsonParse(str: string): any {
  const trimmed = str.trim();
  
  // 1. Direct try
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    console.log("[JSON Repair] Direct parsing failed. Attempting advanced self-healing...");
  }

  // 2. If it is an array of objects, try to find the last complete object
  if (trimmed.startsWith("[")) {
    try {
      let lastValidObjectEnd = -1;
      const stack: string[] = [];
      let inString = false;
      let i = 0;
      
      while (i < trimmed.length) {
        const char = trimmed[i];
        if (char === '"') {
          // Check for escaped quote
          let backslashes = 0;
          let j = i - 1;
          while (j >= 0 && trimmed[j] === '\\') {
            backslashes++;
            j--;
          }
          if (backslashes % 2 === 0) {
            inString = !inString;
          }
          i++;
        } else if (inString) {
          i++;
        } else {
          if (char === '[' || char === '{') {
            stack.push(char);
          } else if (char === ']' || char === '}') {
            const expectedOpen = char === ']' ? '[' : '{';
            if (stack[stack.length - 1] === expectedOpen) {
              stack.pop();
              // If the root is an array, and we just popped a brace '{',
              // and the remaining stack is exactly ['['], we completed a top-level object!
              if (char === '}' && stack.length === 1 && stack[0] === '[') {
                lastValidObjectEnd = i;
              }
            }
          }
          i++;
        }
      }
      
      if (lastValidObjectEnd !== -1) {
        const healedArrayStr = trimmed.substring(0, lastValidObjectEnd + 1) + "]";
        try {
          const parsed = JSON.parse(healedArrayStr);
          console.log(`[JSON Repair] Successfully repaired truncated array to ${parsed.length} completed elements.`);
          return parsed;
        } catch (err) {
          // Fall through to general character closer
        }
      }
    } catch (err) {
      // Fall through
    }
  }

  // 3. General character closer (close unclosed strings and brackets)
  try {
    const stack: string[] = [];
    let inString = false;
    let i = 0;
    let healed = "";
    
    while (i < trimmed.length) {
      const char = trimmed[i];
      healed += char;
      if (char === '"') {
        let backslashes = 0;
        let j = i - 1;
        while (j >= 0 && trimmed[j] === '\\') {
          backslashes++;
          j--;
        }
        if (backslashes % 2 === 0) {
          inString = !inString;
        }
        i++;
      } else if (inString) {
        i++;
      } else {
        if (char === '[' || char === '{') {
          stack.push(char === '[' ? ']' : '}');
        } else if (char === ']' || char === '}') {
          if (stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
        i++;
      }
    }
    
    if (inString) {
      healed += '"';
    }
    
    // Clean up any trailing comma before appending closing brackets
    let tempHealed = healed.trim();
    while (tempHealed.endsWith(",") || tempHealed.endsWith(":")) {
      tempHealed = tempHealed.substring(0, tempHealed.length - 1).trim();
    }
    
    // Append in reverse order to close everything
    for (let s = stack.length - 1; s >= 0; s--) {
      tempHealed += stack[s];
    }
    
    const parsed = JSON.parse(tempHealed);
    console.log("[JSON Repair] Successfully repaired truncated JSON using general closer.");
    return parsed;
  } catch (err: any) {
    console.error("[JSON Repair] All self-healing attempts failed.");
    throw new Error(`Unterminated string in JSON at position ${str.length} (Self-healing failed: ${err.message})`);
  }
}





export const app = express();
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

let DATA_DIR = path.join(process.cwd(), "data");
let UPLOADS_DIR = path.join(process.cwd(), "uploads");
let CHUNKS_DIR = path.join(process.cwd(), "chunks");
let DB_FILE = path.join(process.cwd(), "src", "data", "db.json");

function initServerDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(CHUNKS_DIR)) {
      fs.mkdirSync(CHUNKS_DIR, { recursive: true });
    }
    if (!fs.existsSync(path.dirname(DB_FILE))) {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({}), "utf-8");
    }
  } catch (e) {
    console.warn("Server DB/Uploads directory initialization failed in current directory (likely running in a read-only serverless environment like Vercel). Falling back to OS tmpdir:", e);
    // Fallback everything to os.tmpdir() to guarantee writability
    const tempDir = os.tmpdir();
    DATA_DIR = path.join(tempDir, "data");
    UPLOADS_DIR = path.join(tempDir, "uploads");
    CHUNKS_DIR = path.join(tempDir, "chunks");
    DB_FILE = path.join(tempDir, "db.json");

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      if (!fs.existsSync(CHUNKS_DIR)) {
        fs.mkdirSync(CHUNKS_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}), "utf-8");
      }
      console.log(`Fallback directory initialization completed successfully at: ${tempDir}`);
    } catch (tempErr) {
      console.error("Could not write even to temp directory. Using in-memory mode.", tempErr);
    }
  }
}

initServerDb();

app.get("/api/db", (req, res) => {
  try {
    if (fs.existsSync(DB_FILE)) {
      res.json(JSON.parse(fs.readFileSync(DB_FILE, "utf-8")));
    } else {
      res.json({});
    }
  } catch (e) {
    console.error("DB Read Error:", e);
    res.status(500).json({ error: "Failed to read database" });
  }
});

app.post("/api/db", express.json({ limit: "100mb" }), (req, res) => {
  try {
    const { key, value } = req.body;
    let db: any = {};
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
    db[key] = value;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    res.json({ success: true });
  } catch (e) {
    console.error("DB Write Error:", e);
    res.status(500).json({ error: "Failed to write to database" });
  }
});

// 3. Remove physical files from server disk permanently
app.post("/api/files/delete", (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "No filename provided" });
    }
    const permanentPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(permanentPath)) {
      fs.unlinkSync(permanentPath);
      console.log(`[File System] Successfully deleted source file permanently: ${filename}`);
      res.json({ success: true });
    } else {
      console.log(`[File System] File to delete not found: ${filename}`);
      res.json({ success: true, message: "File already deleted or missing." });
    }
  } catch (e: any) {
    console.error("Failed to delete permanent file on server:", e);
    res.status(500).json({ error: "Failed to delete file: " + e.message });
  }
});

app.post("/api/verify-key", async (req, res) => {
  try {
    const ai = getGenAI(req);
    // Use resilient fallback helper to verify the key, coping with temporary 503 or demand spikes
    const response = await generateContentWithRetryAndFallback({
      contents: "Reply with exactly 'OK'."
    }, ai);
    const text = response.text || "";
    if (text.includes("OK") || text.trim() !== "") {
      return res.json({ success: true });
    }
    return res.status(400).json({ success: false, error: "Invalid API Key or response." });
  } catch (error: any) {
    let msg = error?.message || String(error);
    
    // If the error is a 429 Resource Exhausted, the key is structurally "valid" but out of quota
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      return res.json({ success: true, message: "API Key is valid. (Note: It is currently rate-limited, but saved successfully)." });
    }

    // Extract json if the error string contains json
    try {
      const jsonStart = msg.indexOf("{");
      const jsonEnd = msg.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = msg.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.error && parsed.error.message) {
          msg = parsed.error.message;
        }
      }
    } catch (e) {
      // ignore parsing errors
    }

    return res.status(400).json({ success: false, error: msg });
  }
});

app.post("/api/upload-chunk", upload.single("chunk"), async (req, res) => {
  try {
    const { fileId, chunkIndex } = req.body;
    if (!req.file) return res.status(400).json({ error: "No chunk uploaded" });
    
    initServerDb();
    const chunkDest = path.join(CHUNKS_DIR, `${fileId}_chunk_${chunkIndex}`);
    fs.copyFileSync(req.file.path, chunkDest);
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Chunk upload failed" });
  }
});

async function analyzeAndReturnPDF(permanentPath: string, originalName: string, mimeType: string, ai: any, res: express.Response) {
  try {
    const uploadedFile = await ai.files.upload({
      file: permanentPath,
      config: { mimeType: mimeType },
    });

    const response = await generateContentWithRetryAndFallback({
      model: "gemini-3.5-flash",
      contents: [
        {
           role: "user",
           parts: [
             { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
             { text: `Analyze this document which is a study material for standard competitive exams, specifically targeting HSSC CET Group C, Group D, and HSSC Constable syllabi, with close alignment to NCERT textbook structures. 
             
             CRITICAL EXTRACTION DIRECTIVE:
             - You MUST translate the entire chapter details output into beautifully-formulated, rich Hindi (लिखने में शुद्ध हिन्दी/देवनागरी लिपि का प्रयोग करें). The 'title', 'description', 'topics', 'importantConcepts', and 'subjectFocus' must all be written in clear, competitive exam-level Hindi. You can include standard English terms in parentheses if necessary (e.g., "गति के नियम (Laws of Motion)" or "कोशिका संरचना (Cell Structure)").
             - Review the entire document thoroughly. FIRST, locate the 'Table of Contents' or 'Index' of the document. Use this as your absolute ground truth for identifying the core chapters.
             - You MUST extract EVERY single main academic chapter listed in the Table of Contents. If there are 21 main chapters, you must output exactly 21 chapters. If there are 22, output 22. DO NOT stop early. DO NOT skip any main chapters.
             - EXTREMELY IMPORTANT: Only list the MAIN chapters. DO NOT create separate chapters for small tables, sub-sections, or headings. DO NOT split a single continuous chapter into multiple parts. A single numbered chapter in the book must be exactly ONE chapter in the output.
             - Group all topics, important concepts, and sub-headings belonging to a main chapter tightly under that single chapter's entry.
             - Analyze deeply to extract high-yield 'topics' and 'importantConcepts' for each chapter based on actual content. Arrange them well.
             - DO NOT include entries for auxiliary pages, Table of Contents, Index, Checklist, Appendices, Preface, Acknowledgment, References, Lists of Tables/Figures, or conversion / physical constant tables. ONLY list main core academic chapters.
             - Maintain a strict 1-to-1 chapter structure matching the main chapters of the original textbook. Ensure ABSOLUTELY NO main chapters are skipped. Make this the best, most accurate reflection of the document's structure.
             - DO NOT use outside knowledge. ONLY extract from the document contents.
             - Estimate the total potential high-quality, exam-oriented questions that can be generated for each chapter (between 20 and 50 questions).` }
           ]
         }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             chapters: {
               type: Type.ARRAY,
               items: {
                 type: Type.OBJECT,
                 properties: {
                   title: { type: Type.STRING },
                   description: { type: Type.STRING },
                   topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                   importantConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                   estimatedQuestions: { type: Type.INTEGER }
                 },
                 required: ["title", "description", "topics", "importantConcepts", "estimatedQuestions"]
               }
             },
             totalEstimatedQuestions: { type: Type.INTEGER },
             subjectFocus: { type: Type.STRING }
          },
          required: ["chapters", "totalEstimatedQuestions", "subjectFocus"]
        }
      }
    }, ai);

    let rawText = response.text || "{}";
    if (rawText.includes("```json")) {
      rawText = rawText.split("```json")[1].split("```")[0];
    } else if (rawText.includes("```")) {
      rawText = rawText.split("```")[1].split("```")[0];
    }
    const analysis = robustJsonParse(cleanJsonString(rawText.trim()));

    res.json({
       fileUri: uploadedFile.uri,
       mimeType: uploadedFile.mimeType,
       originalName: originalName,
       localPath: path.basename(permanentPath),
       analysis
     });

  } catch (error: any) {
    const msg = error?.message || String(error);
    const isQuota = msg.includes("429") || msg.includes("503") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("exhausted") ||
      msg.toLowerCase().includes("unavailable") ||
      msg.toLowerCase().includes("high demand") ||
      msg.toLowerCase().includes("overloaded") ||
      msg.toLowerCase().includes("rate_limit") ||
      msg.toLowerCase().includes("rate limit");

    if (isQuota) {
      console.log("[Gemini API] Activating graceful quota fallback PDF analysis...");
      res.json({
         fileUri: "fallback_uri",
         mimeType: mimeType,
         originalName: originalName,
         localPath: path.basename(permanentPath),
         analysis: generateDynamicFallbackAnalysis(originalName),
         isQuotaFallback: true,
         quotaNotice: getQuotaFallbackNotice("Flash-based PDF upload logic")
      });
    } else {
      console.error("Analysis Error:", error);
      const friendlyError = formatGeminiError(error);
      res.status(500).json({ error: friendlyError });
    }
  }
}

app.post("/api/analyze-pdf-chunked", express.json({ limit: "100mb" }), async (req, res) => {
  try {
    const { fileId, totalChunks, originalname, mimetype } = req.body;
    
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
      throw new Error("Quota exceeded: GEMINI_API_KEY is not defined. Falling back.");
    }
    const ai = getGenAI(req);

    initServerDb();
    const cleanName = originalname.replace(/[^a-zA-Z0-9\.\-_]/g, "_");
    const permanentFilename = `${fileId}_${cleanName}`;
    const permanentPath = path.join(UPLOADS_DIR, permanentFilename);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${fileId}_chunk_${i}`);
      const chunkData = fs.readFileSync(chunkPath);
      fs.appendFileSync(permanentPath, chunkData);
      fs.unlinkSync(chunkPath);
    }
    
    console.log(`[File System] Assembled persistent source file to: ${permanentPath}`);
    await analyzeAndReturnPDF(permanentPath, originalname, mimetype, ai, res);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to assemble and analyze chunks" });
  }
});

// 1. Upload and Analyze PDF for Chapters
app.post("/api/analyze-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (req.file.size < 1024) {
      return res.status(400).json({ error: "The uploaded file is too small to be a valid PDF document. Please upload a real PDF." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
      throw new Error("Quota exceeded: GEMINI_API_KEY is not defined. Falling back.");
    }

    const { targetExams } = req.body;
    const ai = getGenAI(req);

    // Save file permanently on the server's disk
    initServerDb();
    const fileId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const cleanName = req.file.originalname.replace(/[^a-zA-Z0-9\.\-_]/g, "_");
    const permanentFilename = `${fileId}_${cleanName}`;
    const permanentPath = path.join(UPLOADS_DIR, permanentFilename);
    fs.copyFileSync(req.file.path, permanentPath);
    console.log(`[File System] Saved persistent source file to: ${permanentPath}`);

    await analyzeAndReturnPDF(permanentPath, req.file.originalname, req.file.mimetype, ai, res);
  } catch (error: any) {
    const msg = error?.message || String(error);
    const friendlyError = formatGeminiError(error);
    res.status(500).json({ error: friendlyError });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
       fs.unlinkSync(req.file.path);
    }
  }
});

// 1.5. Dynamic high-yield Concept Explainer API endpoint for interactive Active Recall Flashcards
app.post("/api/explain-concept", async (req, res) => {
  const { concept, chapterTitle, subjectName } = req.body;
  if (!concept) {
    return res.status(400).json({ error: "No concept provided" });
  }

  try {
    const ai = getGenAI(req);
    const systemPrompt = `You are an elite competitive exam strategist and top-tier professor.
Your task is to analyze the given academic concept and explain it specifically for high-yield competitive exam preparation (like UPSC, SSC, state civil services, or graduate board entry).
You must write your response in beautifully-formulated, rich Hindi (लिखने में शुद्ध हिन्दी/देवनागरी लिपि का प्रयोग करें). If there are technical terms, you can include the English term in parentheses.

Return ONLY a valid JSON object matching the following structure:
{
  "explanation": "A highly precise, robust, and clear 2-3 sentence academic explanation of the concept grounded in competitive exam significance.",
  "keyFacts": [
    "Fact 1: High-yield key fact, article, constitutional amendment, name, historical year, or formula to memorize.",
    "Fact 2: Another crucial exam-oriented fact from the syllabus.",
    "Fact 3: An extra relevant exam point."
  ]
}
Do NOT include any markdown formatting like \`\`\`json or \`\`\`. Return ONLY raw JSON starting with { and ending with }.`;

    const promptText = `Subject: ${subjectName || "General Exam Syllabus"}
Chapter: ${chapterTitle || "General Concepts"}
Academic Concept: ${concept}

Please structure the exam explanation and return raw JSON.`;

    const response = await generateContentWithRetryAndFallback({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + promptText }] }],
      config: {
        responseMimeType: "application/json"
      }
    }, ai);

    const text = response?.text || "";
    const cleanedText = text.trim().replace(/^```json\s*|```$/g, "");
    const parsed = robustJsonParse(cleanJsonString(cleanedText));
    res.json(parsed);
  } catch (err: any) {
    console.warn("[Gemini API] Failed to explain concept, using offline generator:", err);
    // Dynamic fallback in high-yield Hindi
    const fallbackExp = `यह संप्रत्यय (${concept}) '${chapterTitle || "पाठ्यसामग्री"}' का एक अत्यंत महत्वपूर्ण और उच्च-प्राथमिकता वाला विषय है। प्रतियोगी परीक्षाओं के दृष्टिकोण से इसके मूल सिद्धांतों, ऐतिहासिक संदर्भों तथा तात्कालिक निहितार्थों की गहन समझ होना अत्यंत आवश्यक है।`;
    res.json({
      explanation: fallbackExp,
      keyFacts: [
        `महत्व: ${concept} विषय के मुख्य स्तंभों और प्रशासनिक/संवैधानिक प्रावधानों से सीधा जुड़ा हुआ है।`,
        `परीक्षा फोकस: परीक्षाओं में इस संप्रत्यय से संबंधित मुख्य सिद्धांतों, धाराओं तथा ऐतिहासिक निर्णयों पर बहुविकल्पीय तथा विश्लेषणात्मक प्रश्न पूछे जाते हैं।`,
        `अध्ययन रणनीति: इस संप्रत्यय की व्याख्याओं तथा इसके साथ जुड़े व्यावहारिक उदाहरणों का बार-बार अभ्यास (Spaced Repetitive Recall) करना सुनिश्चित करें।`
      ],
      isOfflineFallback: true
    });
  }
});

function shuffleQuestionOptions(q: any): any {
  if (!q || !Array.isArray(q.options) || q.options.length === 0) {
    return q;
  }

  // 1. Identify correct answer text
  let correctText = String(q.correctAnswer || "").trim();
  const options = q.options.map((opt: any) => String(opt || "").trim());

  const letters = ["a", "b", "c", "d"];
  const cleanCorrect = correctText.toLowerCase();

  let correctIndex = -1;

  if (cleanCorrect.length === 1) {
    if (letters.includes(cleanCorrect)) {
      correctIndex = letters.indexOf(cleanCorrect);
    } else {
      const num = parseInt(cleanCorrect, 10);
      if (!isNaN(num)) {
        if (num >= 0 && num < options.length) {
          correctIndex = num;
        } else if (num >= 1 && num <= options.length) {
          correctIndex = num - 1;
        }
      }
    }
  }

  if (correctIndex >= 0 && correctIndex < options.length) {
    correctText = options[correctIndex];
  } else {
    // Try to find exact match
    const exactIdx = options.findIndex((opt: string) => opt.toLowerCase() === cleanCorrect);
    if (exactIdx !== -1) {
      correctText = options[exactIdx];
    } else {
      // Try fuzzy match
      const fuzzyIdx = options.findIndex((opt: string) => {
        const oClean = opt.toLowerCase().replace(/\s+/g, "");
        const cClean = cleanCorrect.replace(/\s+/g, "");
        return oClean.includes(cClean) || cClean.includes(oClean);
      });
      if (fuzzyIdx !== -1) {
        correctText = options[fuzzyIdx];
      }
    }
  }

  // 2. Shuffle options using Fisher-Yates
  const shuffledOptions = [...options];
  for (let i = shuffledOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
  }

  return {
    ...q,
    options: shuffledOptions,
    correctAnswer: correctText
  };
}

// 2. Generate Question Bank for a specific Chapter
app.post("/api/generate-questions", async (req, res) => {
  const { fileUri: clientFileUri, localPath, mimeType, chapterTitle, topics, importantConcepts, targetExams, targetCount } = req.body;
  try {
    const ai = getGenAI(req);

    // Dynamic File Re-upload logic to protect against Gemini File API 48h expiration or empty FileUris
    let fileUri = clientFileUri;
    let finalMimeType = mimeType || "application/pdf";

    if (localPath) {
      const permanentPath = path.join(UPLOADS_DIR, localPath);
      if (fs.existsSync(permanentPath)) {
        try {
          console.log(`[File System] Re-uploading persistent source file to Gemini File API to prevent expiration: ${localPath}`);
          const uploadedFile = await ai.files.upload({
            file: permanentPath,
            config: { mimeType: finalMimeType },
          });
          fileUri = uploadedFile.uri;
          finalMimeType = uploadedFile.mimeType;
        } catch (uploadErr) {
          console.warn(`[File System] Could not dynamically re-upload persistent file to Gemini, using client URI:`, uploadErr);
        }
      } else {
        console.warn(`[File System] Persistent source path not found on server disk: ${permanentPath}. Proceeding with topic-based generation.`);
        // If file doesn't exist, remove fileUri to avoid 404 from Gemini so it falls back to text-only generation!
        fileUri = null;
      }
    }

    console.log(`[Gemini API] Determining optimal dynamic question count (20-50) for "${chapterTitle}" (Topics: ${topics?.length || 0}) based on academic content density.`);

    let countInstruction = "";
    if (targetCount && targetCount !== "auto") {
      const targetNum = parseInt(targetCount);
      countInstruction = `5. STRICT TARGET QUESTION COUNT (EXACTLY ${targetNum} QUESTIONS):
       - You MUST generate EXACTLY ${targetNum} distinct, high-quality, and highly detailed questions based on the chapter's content.
       - Ensure that there are exactly ${targetNum} items in the output JSON array.
       - NEVER generate fewer than ${targetNum} questions and NEVER generate more than ${targetNum} questions. Keep the count perfectly aligned with this target.`;
    } else {
      countInstruction = `5. DYNAMIC QUESTION COUNT DETECTIVE (20 to 50 MAXIMUM):
       - Do NOT hardcode or restrict yourself to 20 or 25 questions. Deeply analyze the overall text length and the dense factual richness of this chapter to determine how many HIGH-QUALITY, EXAM-ORIENTED questions are optimal to fully map this chapter's syllabus.
       - For a shorter or lighter chapter, stick closer to 20 or 25 highly important questions.
       - For a longer, highly detailed, or denser chapter (e.g., cell biology, motion, basic constitution etc.), generate up to 50 questions (the maximum ceiling) to ensure absolutely no high-yield topic or formula is missed.
       - NEVER generate fewer than 20 questions and NEVER generate more than 50 questions. Keep the count perfectly tuned between 20 and 50 based on academic value.`;
    }

    // Prompt the Gemini model to perform targeted, masterclass-level generation
    // of exam-oriented questions strictly based on the uploaded chapter, prioritizing HSSC CET Group C, Group D, and HSSC Constable
    const conceptsText = (importantConcepts && importantConcepts.length > 0)
      ? `\nKey high-yield concepts identified in this chapter which MUST be thoroughly tested in the questions:\n${importantConcepts.map((c: string) => `- ${c}`).join("\n")}`
      : "";

    const promptText = `Focus EXCLUSIVELY and STRICTLY on the chapter content provided for "${chapterTitle}" which covers the topics: ${(topics || []).join(", ")}.${conceptsText}
    
    You are an expert tutor and an examiner setting papers for competitive exams, specifically targeting HSSC CET (Group C and Group D) and HSSC Constable exam syllabi. Think exactly like a senior examiner of Haryana Staff Selection Commission (HSSC) when choosing which questions to ask.
    Your task is to analyze the uploaded chapter very deeply and identify the most crucial, high-yield, exam-oriented concepts. Generate ONLY high-priority, premium-quality multiple choice questions that are highly likely to be asked in the HSSC CET Group C, Group D, or HSSC Constable exams. Do not generate irrelevant, tangential, extraneous, or general trivia filler questions.

    CRITICAL REQUIREMENTS:
    1. EXCLUSIVELY GROUNDED IN THE PROVIDED CHAPTER: Every single question must be formed ONLY from the content of this specific chapter ("${chapterTitle}"). Do NOT pick up facts or questions from other chapters of the book, nor from unrestricted external context. The questions must be 100% grounded in the uploaded file content of this specific chapter. General knowledge questions that do not reside within this specific text are STRICTLY FORBIDDEN.
    2. TARGET EXAMS: HSSC CET Group C, HSSC CET Group D, and HSSC Constable exams. Tap into the standard difficulty, phrasing, and facts expected in Haryana staff selection papers.
    3. NCERT STANDARDS: Align strictly with the basic factual foundation of the NCERT textbooks (as HSSC CET and Constable papers rely heavily on standard NCERT conceptual benchmarks), but only using the concepts present in this specific chapter.
    4. MANDATORY HINDI LANGUAGE (हिन्दी भाषा): All fields ('question', 'options', 'correctAnswer', 'explanation', 'topicTag') MUST be in Hindi. Use simple, standard, clear, and extremely easy-to-understand Hindi (Devanagari script) matching the exact vocabulary of HSSC CET and HSSC Constable exams. For scientific, historical, or technical terms, provide the standard Hindi translation and put the English term in brackets if helpful (e.g., 'अपवर्तन (Refraction)' or 'कोशिका झिल्ली (Cell Membrane)'). The options must be entirely in Hindi and the correctAnswer must match the correct option exactly.
    ${countInstruction}
    6. KEY COMPACTION RULES (MANDATORY TO PREVENT TRUNCATION):
       - EXPLANATION: Write extremely short, direct, simple, and concise explanations in the "explanation" field in Hindi (strictly limited to 1 simple sentence of under 10-15 words). For example: "अपवर्तन के कारण ही तारे टिमटिमाते हुए दिखाई देते हैं।" or "अम्ल नीले लिटमस पत्र को लाल कर देता है।"
       - OPTIONS: Keep option choices very short, straightforward, and direct.
       - This guarantees that all required questions comfortably fit within the output generation limit.
    7. EXPERT COMPLETENESS & HIGH YIELD: Ensure no important or exam-oriented questions are missed from this chapter. Avoid any generic low-relevance general knowledge trivia. Every question must drill into distinct, important conceptual facts or topics of the chapter to satisfy the questions count properly without repetition.
    8. NO QUESTION NUMBERS OR PREFIXES: DO NOT include any question numbers, prefixes, letters, lists, or headers (e.g., "1. ", "Q1.", "Question: ") in the "question" text field.
    9. FORMAT: Every question must contain exactly 4 options. One option must match the correctAnswer exactly.
    10. COMPREHENSIVE COVERAGE: Ensure you formulate specific questions targeting key formulas, numerical factors, scientific laws, key dates, historical events, state acts, definitions, and distinct features. DO NOT leave out any significant concept.
    
    Style to align: HSSC CET Group C, HSSC CET Group D, HSSC Constable, NCERT baselines, and Standard Competitive Exams.`;

    const userParts: any[] = [];
    if (fileUri) {
      userParts.push({ fileData: { fileUri, mimeType: finalMimeType } });
    } else {
      userParts.push({ text: `(The physical document was permanently archived or not available. Proceed exclusively using the topic metadata provided below.)\n\n` });
    }
    userParts.push({ text: promptText });

    const response = await generateContentWithRetryAndFallback({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: userParts
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
             type: Type.OBJECT,
             properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 4 options" },
                correctAnswer: { type: Type.STRING, description: "Must exactly match one option" },
                explanation: { type: Type.STRING },
                topicTag: { type: Type.STRING },
                difficulty: { type: Type.STRING, description: "Beginner, Intermediate, or Advanced" },
                sourceReference: { type: Type.STRING, description: "E.g., Page 3, Paragraph 2" }
             },
             required: ["question", "options", "correctAnswer", "explanation", "topicTag", "difficulty", "sourceReference"]
          }
         }
      }
    }, ai);

    let rawText = response.text || "[]";
    if (rawText.includes("```json")) {
      rawText = rawText.split("```json")[1].split("```")[0];
    } else if (rawText.includes("```")) {
      rawText = rawText.split("```")[1].split("```")[0];
    }
    const parsed = robustJsonParse(cleanJsonString(rawText.trim()));
    
    // Server-side sanitization of numbering prefixes, e.g. "1. ", "Question: ", "Q12. "
    const questions = (Array.isArray(parsed) ? parsed : []).map((q: any) => {
      let cleanedQuestion = q.question ? q.question.trim() : "";
      // Strip starting numbering and labels like "Question 2: ", "Question: ", "Q1: ", "Q: ", "1. ", etc.
      cleanedQuestion = cleanedQuestion.replace(/^(Q|q)uestion\s*\d+[\s\.\:\-]*|^(Q|q)uestion\s*[\.\:\-]+\s*|^[Qq]\d+[\s\.\:\-]*|^[Qq][\.\:\-]+\s*|^\d+[\s\.\)\:\-]+\s*/g, "").trim();
      return shuffleQuestionOptions({
        ...q,
        question: cleanedQuestion
      });
    });

    res.json({ questions });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const isQuota = msg.includes("429") || msg.includes("503") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("exhausted") ||
      msg.toLowerCase().includes("unavailable") ||
      msg.toLowerCase().includes("high demand") ||
      msg.toLowerCase().includes("overloaded") ||
      msg.toLowerCase().includes("rate_limit") ||
      msg.toLowerCase().includes("rate limit");

    if (isQuota) {
      console.log("[Gemini API] Activating graceful quota fallback question generation...");
    }

    console.error("Generation Error:", error);
    const friendlyError = formatGeminiError(error);
    res.status(500).json({ error: friendlyError });
  }
});

function formatGeminiError(error: any): string {
  const msg = error?.message || String(error);
  if (
    msg.includes("429") ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("exhausted") ||
    msg.toLowerCase().includes("rate_limit") ||
    msg.toLowerCase().includes("rate limit")
  ) {
    return "Your Gemini API free tier daily or per-minute quota has been completed or exceeded. To bypass this limitation and generate unlimited high-quality exam questions instantly, please add your own API Key in Google AI Studio via 'Settings > Secrets' (or wait a few minutes for the rate limit to reset!).";
  }
  return msg;
}

app.post("/api/recover-uploads", async (req, res) => {
  try {
    const { subjects } = req.body;
    if (!Array.isArray(subjects)) {
      return res.status(400).json({ error: "Invalid subjects parameter" });
    }

    const uploadsDir = UPLOADS_DIR;
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ recovered: [] });
    }

    const files = fs.readdirSync(uploadsDir);
    const pdfFiles = files.filter(f => f.endsWith(".pdf"));

    const clientLocalPaths = new Set<string>();
    subjects.forEach((sub: any) => {
      if (sub.documents) {
        sub.documents.forEach((d: any) => {
          if (d.localPath) {
            clientLocalPaths.add(d.localPath);
          }
        });
      }
    });

    const recovered: any[] = [];
    let ai: GoogleGenAI | null = null;
    try {
      ai = getGenAI(req);
    } catch (e) {
      console.warn("[Recovery] Gemini AI client could not be initialized (missing/invalid key). Proceeding with offline recovery.");
    }

    for (const filename of pdfFiles) {
      if (clientLocalPaths.has(filename)) {
        continue;
      }

      const pdfPath = path.join(uploadsDir, filename);
      if (!fs.existsSync(pdfPath)) {
        continue;
      }
      const stats = fs.statSync(pdfPath);
      if (stats.size < 1024) {
        console.warn(`[Recovery] Skipping unreferenced physical file ${filename} because it is too small to be a valid PDF (${stats.size} bytes).`);
        continue;
      }

      console.log(`[Recovery] Found unreferenced physical file: ${filename}`);
      const jsonPath = pdfPath.replace(/\.pdf$/, ".json");
      
      let analysisResult: any = null;

      if (fs.existsSync(jsonPath)) {
        try {
          analysisResult = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
          console.log(`[Recovery] Loaded cached analysis from: ${jsonPath}`);
        } catch (e) {
          console.warn(`[Recovery] Corrupted json cache at ${jsonPath}:`, e);
        }
      }

      if (!analysisResult) {
        try {
          if (!ai) {
            throw new Error("No API key configured for online analysis.");
          }
          console.log(`[Recovery] Analyzing PDF using Gemini: ${pdfPath}`);
          const uploadedFile = await ai.files.upload({
            file: pdfPath,
            config: { mimeType: "application/pdf" },
          });

          const response = await generateContentWithRetryAndFallback({
            model: "gemini-3.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
                  { text: `Analyze this document which is a study material for standard competitive exams, specifically targeting HSSC CET Group C, Group D, and HSSC Constable syllabi, with close alignment to NCERT textbook structures. 
                  
                  CRITICAL EXTRACTION DIRECTIVE:
                  - You MUST translate the entire chapter details output into beautifully-formulated, rich Hindi (लिखने में शुद्ध हिन्दी/देवनागरी लिपि का प्रयोग करें). The 'title', 'description', 'topics', 'importantConcepts', and 'subjectFocus' must all be written in clear, competitive exam-level Hindi. You can include standard English terms in parentheses if necessary (e.g., "गति के नियम (Laws of Motion)" or "कोशिका संरचना (Cell Structure)").
                  - Review the entire document thoroughly, page-by-page. You MUST identify and extract EVERY single main academic chapter present in the document. DO NOT truncate, combine, skip, or only extract the first few chapters. We need a complete list of all main chapters in standard sequence!
                  - DO NOT include entries for small sub-sections, minor tables, auxiliary pages, Table of Contents, Index, Checklist, Appendices, Preface, Acknowledgment, References, Lists of Tables/Figures, or conversion / physical constant tables. ONLY list main core academic chapters.
                  - Maintain a strict 1-to-1 chapter structure matching the main chapters of the original textbook. Ensure ABSOLUTELY NO chapters are skipped. You MUST return every single numbered chapter, from Chapter 1 to the final chapter (e.g. if the book has 30 chapters, you must list all 30). Do not stop early!
                  - DO NOT use outside knowledge. ONLY extract from the document contents.
                  - Estimate the total potential high-quality, exam-oriented questions that can be generated for each chapter (between 20 and 50 questions).` }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  chapters: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                        importantConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                        estimatedQuestions: { type: Type.INTEGER }
                      },
                      required: ["title", "description", "topics", "importantConcepts", "estimatedQuestions"]
                    }
                  },
                  totalEstimatedQuestions: { type: Type.INTEGER },
                  subjectFocus: { type: Type.STRING }
                },
                required: ["chapters", "totalEstimatedQuestions", "subjectFocus"]
              }
            }
          }, ai);

          let rawText = response.text || "{}";
          if (rawText.includes("```json")) {
            rawText = rawText.split("```json")[1].split("```")[0];
          } else if (rawText.includes("```")) {
            rawText = rawText.split("```")[1].split("```")[0];
          }
          analysisResult = JSON.parse(rawText.trim());

          fs.writeFileSync(jsonPath, JSON.stringify(analysisResult, null, 2), "utf-8");
          console.log(`[Recovery] Saved analysis cache to: ${jsonPath}`);
        } catch (geminiErr) {
          console.warn(`[Recovery] Gemini analysis failed for ${filename}:`, geminiErr);
        }
      }

      if (analysisResult && analysisResult.chapters) {
        const docId = "doc-" + Date.now() + Math.random().toString(36).substring(2, 9);
        const stats = fs.statSync(pdfPath);
        
        const cleanFocus = (analysisResult.subjectFocus || "").toLowerCase();
        let targetSubjectId = subjects[0]?.id || "subj-physics";
        
        const matched = subjects.find((s: any) => 
          cleanFocus.includes(s.name.toLowerCase()) || 
          s.name.toLowerCase().includes(cleanFocus)
        );
        if (matched) {
          targetSubjectId = matched.id;
        } else {
          const nameLower = filename.toLowerCase();
          if (nameLower.includes("physics")) targetSubjectId = subjects.find((s: any) => s.name === "Physics")?.id || targetSubjectId;
          else if (nameLower.includes("chem")) targetSubjectId = subjects.find((s: any) => s.name === "Chemistry")?.id || targetSubjectId;
          else if (nameLower.includes("bio")) targetSubjectId = subjects.find((s: any) => s.name === "Biology")?.id || targetSubjectId;
          else if (nameLower.includes("geog")) targetSubjectId = subjects.find((s: any) => s.name === "Geography")?.id || targetSubjectId;
          else if (nameLower.includes("econ")) targetSubjectId = subjects.find((s: any) => s.name === "Economics")?.id || targetSubjectId;
          else if (nameLower.includes("hayana") || nameLower.includes("haryana")) targetSubjectId = subjects.find((s: any) => s.name === "Haryana GK")?.id || targetSubjectId;
          else if (nameLower.includes("comp")) targetSubjectId = subjects.find((s: any) => s.name === "Computer")?.id || targetSubjectId;
          else if (nameLower.includes("hindi")) targetSubjectId = subjects.find((s: any) => s.name === "Hindi")?.id || targetSubjectId;
          else if (nameLower.includes("eng")) targetSubjectId = subjects.find((s: any) => s.name === "English")?.id || targetSubjectId;
          else if (nameLower.includes("history")) {
            if (nameLower.includes("ancient")) targetSubjectId = subjects.find((s: any) => s.name === "Ancient History")?.id || targetSubjectId;
            else if (nameLower.includes("med")) targetSubjectId = subjects.find((s: any) => s.name === "Medieval History")?.id || targetSubjectId;
            else targetSubjectId = subjects.find((s: any) => s.name === "Modern History")?.id || targetSubjectId;
          }
        }

        const cleanName = filename
          .replace(/^\d+_[a-z0-9]+_/, "")
          .replace(/\.pdf$/, "")
          .replace(/[_-]/g, " ")
          .trim();

        const recoveredDoc = {
          id: docId,
          subjectId: targetSubjectId,
          name: cleanName + ".pdf",
          size: stats.size,
          uploadedAt: Date.now(),
          totalEstimatedQuestions: analysisResult.totalEstimatedQuestions || 0,
          fileUri: "",
          mimeType: "application/pdf",
          localPath: filename,
          chapters: analysisResult.chapters.map((c: any) => ({
             id: "ch-" + Date.now() + Math.random().toString(36).substring(2, 9),
             documentId: docId,
             title: c.title,
             description: c.description,
             topics: c.topics,
             importantConcepts: c.importantConcepts || [],
             estimatedQuestions: c.estimatedQuestions || 20
          }))
        };

        recovered.push(recoveredDoc);
      }
    }

    // Removed JSON caching fallback block
    res.json({ recovered });
  } catch (err: any) {
    console.error("[Recovery] Error recovering uploads:", err);
    res.status(500).json({ error: err.message || "Failed to recover uploaded files" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Safety net: Any unhandled /api route returns 404 JSON instead of falling through to SPA HTML
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API route not found: " + req.originalUrl });
});

export default app;

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Error handling middleware to prevent HTML error pages
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  // Only listen to port if not running in a Serverless environment like Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();
