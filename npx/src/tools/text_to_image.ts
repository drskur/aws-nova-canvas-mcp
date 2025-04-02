import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { generateImage } from "../utils/bedrock";
import { saveImage } from "../utils/image";
import { z } from "zod";

// Schema definition
export const TextToImageSchema = z.object({
  prompt: z.string().describe("The text prompt to generate an image from"),
  output_path: z.string().describe("Custom output path for the generated image"),
  negative_prompt: z.string().optional().default("").describe("Negative prompt to guide what not to include"),
  height: z.number().optional().default(1024).describe("Image height"),
  width: z.number().optional().default(1024).describe("Image width"),
  num_images: z.number().optional().default(1).describe("Number of images to generate"),
  cfg_scale: z.number().optional().default(8.0).describe("CFG scale"),
  seed: z.number().optional().default(0).describe("Random seed"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type TextToImageParams = z.infer<typeof TextToImageSchema>;

export async function textToImage(
  params: TextToImageParams
): Promise<CallToolResult> {
  try {
    const {
      prompt,
      output_path,
      negative_prompt,
      height,
      width,
      num_images,
      cfg_scale,
      seed,
      open_browser = true
    } = params;

    const body = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
        negativeText: negative_prompt,
      },
      imageGenerationConfig: {
        height: height,
        width: width,
        numberOfImages: num_images,
        cfgScale: cfg_scale,
        seed: seed,
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
          text: `Image generated successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error("Error in text to image generation:", error);

    return {
      content: [
        {
          type: "text",
          text: `Error occurred while generating image: ${error.message}`
        }
      ]
    };
  }
}