import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from "zod";

const readFile = promisify(fs.readFile);

// Schema definition
export const ColorGuidedGenerationSchema = z.object({
  prompt: z.string().describe("Text prompt to guide the generation"),
  colors: z.array(z.string()).describe("List of colors in hex format"),
  output_path: z.string().describe("Path to save the generated image"),
  reference_image_path: z.string().optional().describe("Optional file path of the reference image"),
  negative_prompt: z.string().optional().default("").describe("Negative prompt to avoid certain elements"),
  height: z.number().optional().default(512).describe("Height of the generated image"),
  width: z.number().optional().default(512).describe("Width of the generated image"),
  cfg_scale: z.number().optional().default(8.0).describe("CFG scale for image generation"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type ColorGuidedGenerationParams = z.infer<typeof ColorGuidedGenerationSchema>;

/**
 * Generate an image guided by color palette and optional reference image.
 * 
 * @param prompt - Text prompt to guide the generation
 * @param colors - List of colors in hex format
 * @param reference_image_path - Optional file path of the reference image
 * @param negative_prompt - Negative prompt to avoid certain elements
 * @param height - Height of the generated image
 * @param width - Width of the generated image
 * @param cfg_scale - CFG scale for image generation
 * @param output_path - Path to save the generated image
 * @returns Dictionary containing the file path of the generated image
 */
export async function colorGuidedGeneration(
  params: ColorGuidedGenerationParams
): Promise<CallToolResult> {
  try {
    const {
      prompt,
      colors,
      reference_image_path,
      output_path,
      negative_prompt,
      height,
      width,
      cfg_scale,
      open_browser = true
    } = params;    

    let colorGuidedGenerationParams: Record<string, any> = {
      text: prompt,
      negativeText: negative_prompt,
      colors: colors,
    }
    if (reference_image_path) {
      const imageBuffer = await readFile(reference_image_path);
      colorGuidedGenerationParams['referenceImage'] = imageBuffer.toString('base64');
    }


    const body = {
      taskType: "COLOR_GUIDED_GENERATION",
      colorGuidedGenerationParams,
      imageGenerationConfig: {
        height: height,
        width: width,
        numberOfImages: 1,
        cfgScale: cfg_scale,
      }
    };

    // Generate image
    const imageBytes = await generateImage(body);

    // Save image
    const imageInfo = await saveImage(imageBytes, open_browser, output_path);

    return {
      content: [
        {
          type: "text",
          text: `Color guided image generated successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in color guided generation:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred during color guided generation: ${error.message}`
        }
      ]
    };
  }
}
