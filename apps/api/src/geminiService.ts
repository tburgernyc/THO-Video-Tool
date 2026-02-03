import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

const apiKey = process.env.API_KEY || '';
// Fallback to a valid model if env is not set
const modelId = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest';

const genAI = new GoogleGenerativeAI(apiKey);

// Validation Schemas
const ScriptAnalysisSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
  scenes: z.array(z.object({
    id: z.number(),
    description: z.string(),
    characters: z.array(z.string()),
  })),
});

const ScenePromptsSchema = z.object({
  prompts: z.array(z.object({
    id: z.number(),
    prompt: z.string(),
    negative_prompt: z.string().optional().default("low quality, distorted, bad anatomy"),
  }))
});

// Helper for retries
async function generateWithRetry(
  prompt: string,
  responseSchema: any,
  retries = 3,
  backoff = 1000
): Promise<any> {
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.7,
    }
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn(`JSON Parse error on attempt ${attempt}:`, e);
        throw new Error("Invalid JSON received from Gemini");
      }

    } catch (error: any) {
      console.error(`Gemini Attempt ${attempt + 1} failed:`, error.message);
      if (attempt === retries) throw error;

      const delay = backoff * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function analyzeScript(script: string) {
  const prompt = `Analyze this movie script.
1. Extract a list of main characters with visual descriptions (appearance, style).
2. Break down the script into scenes. For each scene, provide a sequential ID, a brief visual summary of the action, and a list of characters present.
Output must be strictly JSON matching the schema.`;

  // Define Schema for Gemini
  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      characters: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING }
          },
          required: ["name", "description"]
        }
      },
      scenes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER },
            description: { type: SchemaType.STRING },
            characters: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
          },
          required: ["id", "description", "characters"]
        }
      }
    },
    required: ["characters", "scenes"]
  };

  try {
    const data = await generateWithRetry(prompt + "\n\nSCRIPT:\n" + script, schema);
    return ScriptAnalysisSchema.parse(data);
  } catch (error) {
    console.error("Script Analysis Failed:", error);
    // Return empty structure on total failure to avoid crashing API
    return { characters: [], scenes: [] };
  }
}

export async function generateScenePrompts(scenes: any[]) {
  const prompt = `For each scene provided, write a highly detailed, cinematic visual prompt for an AI video generator (LTX-2).
Focus on lighting, camera angle, motion, texture, and mood.
Also provide a negative prompt to avoid bad quality.
Output strictly JSON.`;

  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      prompts: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER },
            prompt: { type: SchemaType.STRING },
            negative_prompt: { type: SchemaType.STRING }
          },
          required: ["id", "prompt", "negative_prompt"]
        }
      }
    },
    required: ["prompts"]
  };

  try {
    const data = await generateWithRetry(prompt + "\n\nSCENES:\n" + JSON.stringify(scenes), schema);
    const parsed = ScenePromptsSchema.parse(data);
    return parsed.prompts;
  } catch (error) {
    console.error("Prompt Generation Failed:", error);
    return [];
  }
}
