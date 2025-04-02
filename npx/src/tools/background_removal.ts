import * as fs from 'fs';
import { promisify } from 'util';
import { generateImage } from '../utils/bedrock';
import { saveImage } from '../utils/image';
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

const readFile = promisify(fs.readFile);

// Schema definition
export const BackgroundRemovalSchema = z.object({
  image_path: z.string().describe("File path of the original image"),
  output_path: z.string().describe("Absolute path to save the image"),
  open_browser: z.boolean().optional().default(true).describe("Whether to open the image in browser")
});

// Create type from schema
export type BackgroundRemovalParams = z.infer<typeof BackgroundRemovalSchema>;

/**
 * Remove the background of an image automatically.
 * 
 * @param params - Parameters for background removal
 * @returns CallToolResult containing success message or error
 */
export async function backgroundRemoval(
  params: BackgroundRemovalParams
): Promise<CallToolResult> {
  try {
    const { 
      image_path, 
      output_path,
      open_browser = true 
    } = params;
    
    // Read image file and encode to base64
    const imageBuffer = await readFile(image_path);
    const inputImage = imageBuffer.toString('base64');

    const body = {
      taskType: "BACKGROUND_REMOVAL",
      backgroundRemovalParams: {
        image: inputImage,
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
          text: `Background removed successfully. Saved location: ${imageInfo.imagePath}`
        }
      ]
    };
  } catch (error: any) {
    console.error('Error in background removal:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error occurred while removing background: ${error.message}`
        }
      ]
    };
  }
}
