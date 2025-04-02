import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from "zod";

const readFile = promisify(fs.readFile);

// Schema definition
export const ImageConditioningSchema = z.object({
  image_path: z.string().describe("File path of the reference image"),
  prompt: z.string().describe("Text prompt to guide the generation"),
  output_path: z.string().describe("Path to save the generated image"),
  negative_prompt: z.string().optional().default("").describe("Negative prompt to avoid certain elements"),
  control_mode: z.string().optional().default("CANNY_EDGE").describe("Control mode for image conditioning (CANNY_EDGE, DEPTH, POSE)"),
  height: z.number().optional().default(512).describe("Height of the generated image"),
  width: z.number().optional().default(512).describe("Width of the generated image"),
  cfg_scale: z.number().optional().default(8.0).describe("CFG scale for image generation"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type ImageConditioningParams = z.infer<typeof ImageConditioningSchema>;

/**
 * Generate an image based on a reference image and a text prompt.
 */
export async function imageConditioning(
  params: ImageConditioningParams
): Promise<CallToolResult> {
  try {
    const {
      image_path,
      prompt,
      output_path,
      negative_prompt,
      control_mode,
      height,
      width,
      cfg_scale,
      open_browser
    } = params;

    // Read image file and encode to base64
    const imageBuffer = await readFile(image_path);
    const inputImage = imageBuffer.toString('base64');

    const body = {
      taskType: "IMAGE_CONDITIONING",
      imageConditioningParams: {
        image: inputImage,
        text: prompt,
        negativeText: negative_prompt,
        controlMode: control_mode,
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
          text: `Image conditioning completed successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in image conditioning:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred during image conditioning: ${error.message}`
        }
      ]
    };
  }
}
