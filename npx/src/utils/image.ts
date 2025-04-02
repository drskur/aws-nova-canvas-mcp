import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as util from 'util';
import {ImageResponse} from '../types';

const writeFileAsync = util.promisify(fs.writeFile);
const readFileAsync = util.promisify(fs.readFile);
const mkdirAsync = util.promisify(fs.mkdir);

// Create images directory if it doesn't exist
const imagesDir = path.join(process.cwd(), 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, {recursive: true});
}

// In-memory cache for images
const imageCache = new Map<string, Buffer>();

export async function getImage(imageId: string): Promise<Buffer> {
    // Check cache first
    if (imageCache.has(imageId)) {
        return imageCache.get(imageId)!;
    }

    // If not in cache, read from file
    try {
        const imagePath = path.join(imagesDir, `${imageId}.png`);
        const imageData = await readFileAsync(imagePath);

        // Add to cache
        imageCache.set(imageId, imageData);

        return imageData;
    } catch (error) {
        console.error(`Error retrieving image ${imageId}:`, error);
        throw new Error(`Image ${imageId} not found`);
    }
}

export async function saveImage(
    imageBytes: Buffer,
    openBrowser: boolean = true,
    outputPath: string
): Promise<ImageResponse> {
    try {
        // Generate a unique ID for the image
        const imageId = crypto.randomUUID();

        // Determine where to save the image
        const imagePath = outputPath || path.join(imagesDir, `${imageId}.png`);

        // Ensure directory exists
        const dir = path.dirname(imagePath);
        if (!fs.existsSync(dir)) {
            await mkdirAsync(dir, {recursive: true});
        }

        // Write the image to disk
        await writeFileAsync(imagePath, imageBytes);

        // Add to cache
        imageCache.set(imageId, imageBytes);

        // Create response
        const response: ImageResponse = {
            imageId,
            imagePath,
            url: `file://${imagePath}`
        };

        // Open in browser if requested
        if (openBrowser) {
            const {exec} = require('child_process');
            const command = process.platform === 'win32'
                ? `start ${imagePath}`
                : process.platform === 'darwin'
                    ? `open ${imagePath}`
                    : `xdg-open ${imagePath}`;

            exec(command, (error: any) => {
                if (error) {
                    console.error('Error opening image:', error);
                }
            });
        }

        return response;
    } catch (error) {
        console.error('Error saving image:', error);
        throw error;
    }
}
