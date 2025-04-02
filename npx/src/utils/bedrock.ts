import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAppConfig } from '../config';

const config = getAppConfig();
const MODEL_ID = config.modelId;

// Create Bedrock client
const client = new BedrockRuntimeClient({
  region: config.region,
});

export async function generateImage(body: any): Promise<Buffer> {
  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body)
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract image data based on the response structure
    // This may need to be adjusted based on the actual Bedrock API response
    const imageBase64 = responseBody.images?.[0] || responseBody.image;
    
    if (!imageBase64) {
      throw new Error('No image data in response');
    }
    
    return Buffer.from(imageBase64, 'base64');
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}
