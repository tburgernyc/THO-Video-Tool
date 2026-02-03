import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

// Strictly using process.env.API_KEY as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const modelId = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

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
    negative_prompt: z.string().optional().default("low quality, distorted"),
  }))
});

export async function analyzeScript(script: string) {
  const prompt = `Analyze this script. Extract characters with visual descriptions and breakdown scenes with a summary of action and character presence.`;
  
  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt + "\n\nSCRIPT:\n" + script,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "Sequential scene number" },
                description: { type: Type.STRING, description: "Brief summary of action" },
                characters: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          }
        }
      }
    }
  });

  try {
    const raw = JSON.parse(response.text || '{}');
    return ScriptAnalysisSchema.parse(raw);
  } catch (error) {
    console.error("Gemini Validation Error (Analyze):", error);
    // Return empty fallback structure or rethrow based on preference
    return { characters: [], scenes: [] }; 
  }
}

export async function generateScenePrompts(scenes: any[]) {
  const prompt = `For each scene provided, write a highly detailed visual prompt for LTX-2 video generation. Focus on lighting, camera angle, motion, and texture. Also provide a negative prompt.`;
  
  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt + "\n\nSCENES:\n" + JSON.stringify(scenes),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                prompt: { type: Type.STRING },
                negative_prompt: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  try {
    const raw = JSON.parse(response.text || '{}');
    const parsed = ScenePromptsSchema.parse(raw);
    return parsed.prompts;
  } catch (error) {
    console.error("Gemini Validation Error (Prompts):", error);
    return [];
  }
}