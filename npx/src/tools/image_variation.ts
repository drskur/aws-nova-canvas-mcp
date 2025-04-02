import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

const readFile = promisify(fs.readFile);

// Schema definition
export const ImageVariationSchema = z.object({
  image_paths: z.array(z.string()).describe('List of file paths of the reference images'),
  prompt: z.string().optional().default('').describe('Text prompt to guide the variation'),
  negative_prompt: z.string().optional().default('').describe('Negative prompt to avoid certain elements'),
  similarity_strength: z.number().optional().default(0.7).describe('Strength of similarity to the reference image'),
  height: z.number().optional().default(512).describe('Height of the generated image'),
  width: z.number().optional().default(512).describe('Width of the generated image'),
  cfg_scale: z.number().optional().default(8.0).describe('CFG scale for image generation'),
  open_browser: z.boolean().optional().default(false).describe('Whether to open the image in browser'),
  output_path: z.string().describe('Path to save the generated image')
});

// Create type from schema
export type ImageVariationParams = z.infer<typeof ImageVariationSchema>;

/**
 * Generate variations of an image based on a text prompt.
 */
export async function imageVariation(
  params: ImageVariationParams
): Promise<CallToolResult> {
  try {
    const {
      image_paths,
      prompt,
      negative_prompt,
      similarity_strength,
      height,
      width,
      cfg_scale,
      open_browser,
      output_path
    } = params;

    // Read image files and encode to base64
    const images: string[] = [];
    for (const imagePath of image_paths) {
      const imageBuffer = await readFile(imagePath);
      images.push(imageBuffer.toString('base64'));
    }

    const body = {
      taskType: "IMAGE_VARIATION",
      imageVariationParams: {
        images: images,
        text: prompt,
        negativeText: negative_prompt,
        similarityStrength: similarity_strength,
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
          text: `Image variation generated successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in image variation:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred during image variation: ${error.message}`
        }
      ]
    };
  }
}
