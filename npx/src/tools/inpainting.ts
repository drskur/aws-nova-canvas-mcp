import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from "zod";

const readFile = promisify(fs.readFile);

// Schema definition
export const InpaintingSchema = z.object({
  image_path: z.string().describe("File path of the original image"),
  prompt: z.string().describe("Text prompt to guide the inpainting"),
  mask_prompt: z.string().describe("Text prompt to specify the area to inpaint"),
  output_path: z.string().describe("Path to save the generated image"),
  negative_prompt: z.string().optional().default("").describe("Negative prompt to avoid certain elements"),
  height: z.number().optional().default(512).describe("Height of the generated image"),
  width: z.number().optional().default(512).describe("Width of the generated image"),
  cfg_scale: z.number().optional().default(8.0).describe("CFG scale for image generation"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type InpaintingParams = z.infer<typeof InpaintingSchema>;

/**
 * Inpaint an image based on a text prompt and mask prompt.
 * 
 * @param image_path - File path of the original image
 * @param prompt - Text prompt to guide the inpainting
 * @param mask_prompt - Text prompt to specify the area to inpaint
 * @param negative_prompt - Negative prompt to avoid certain elements
 * @param height - Height of the generated image
 * @param width - Width of the generated image
 * @param cfg_scale - CFG scale for image generation
 * @param open_browser - Whether to open the image in browser
 * @param output_path - Path to save the generated image
 * @returns Dictionary containing the file path of the inpainted image
 */
export async function inpainting(
  params: InpaintingParams
): Promise<CallToolResult> {
  try {
    const {
      image_path,
      prompt,
      mask_prompt,
      output_path,
      negative_prompt,
      height,
      width,
      cfg_scale,
      open_browser
    } = params;

    // Read image file and encode to base64
    const imageBuffer = await readFile(image_path);
    const inputImage = imageBuffer.toString('base64');

    const body = {
      taskType: "INPAINTING",
      inpaintingParams: {
        image: inputImage,
        text: prompt,
        negativeText: negative_prompt,
        maskPrompt: mask_prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: height,
        width: width,
        cfgScale: cfg_scale
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
          text: `Inpainting completed successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in inpainting:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred during inpainting: ${error.message}`
        }
      ]
    };
  }
}
