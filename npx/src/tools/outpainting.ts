import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from "zod";

const readFile = promisify(fs.readFile);

// Schema definition
export const OutpaintingSchema = z.object({
  prompt: z.string().describe("Text prompt to guide the outpainting"),
  output_path: z.string().describe("Path to save the generated image"),
  image_path: z.string().describe("File path of the original image"),
  mask_image_path: z.string().describe("File path of the mask image"),
  negative_prompt: z.string().optional().default("").describe("Negative prompt to avoid certain elements"),
  height: z.number().optional().default(512).describe("Height of the generated image"),
  width: z.number().optional().default(512).describe("Width of the generated image"),
  outpainting_mode: z.string().optional().default("DEFAULT").describe("Mode for outpainting (DEFAULT, PRECISE)"),
  cfg_scale: z.number().optional().default(8.0).describe("CFG scale for image generation"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type OutpaintingParams = z.infer<typeof OutpaintingSchema>;

/**
 * Outpaint an image based on a text prompt and mask image.
 * 
 * @param prompt - Text prompt to guide the outpainting
 * @param output_path - Path to save the generated image
 * @param image_path - File path of the original image
 * @param mask_image_path - File path of the mask image
 * @param negative_prompt - Negative prompt to avoid certain elements
 * @param height - Height of the generated image
 * @param width - Width of the generated image
 * @param outpainting_mode - Mode for outpainting (DEFAULT, PRECISE)
 * @param cfg_scale - CFG scale for image generation
 * @param open_browser - Whether to open the image in browser
 * @returns Dictionary containing the file path of the outpainted image
 */
export async function outpainting(
  params: OutpaintingParams
): Promise<CallToolResult> {
  try {
    const {
      prompt,
      output_path,
      image_path,
      mask_image_path,
      negative_prompt,
      height,
      width,
      outpainting_mode,
      cfg_scale,
      open_browser = true
    } = params;

    // Read image files and encode to base64
    const imageBuffer = await readFile(image_path);
    const inputImage = imageBuffer.toString('base64');
    
    const maskBuffer = await readFile(mask_image_path);
    const maskImage = maskBuffer.toString('base64');

    const body = {
      taskType: "OUTPAINTING",
      outpaintingParams: {
        image: inputImage,
        maskImage: maskImage,
        text: prompt,
        negativeText: negative_prompt,
        outpaintingMode: outpainting_mode,
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
          text: `Outpainting completed successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in outpainting:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred during outpainting: ${error.message}`
        }
      ]
    };
  }
}
