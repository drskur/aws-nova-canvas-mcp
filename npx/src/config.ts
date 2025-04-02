import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file if it exists
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  dotenv.config();
}

export interface AppConfig {
  modelId: string;
  region: string;
  accessKey?: string;
  secretKey?: string;
  profile?: string;
  port: number;
}

export function getAppConfig(): AppConfig {
  const config: AppConfig = {
    modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-canvas-v1:0',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    profile: process.env.AWS_PROFILE,
    port: parseInt(process.env.PORT || '9527', 10)
  };

  // Check if AWS credentials are properly set
  const hasProfile = Boolean(config.profile);
  const hasKeys = Boolean(config.accessKey && config.secretKey);

  if (!hasProfile && !hasKeys) {
    console.log("AWS credentials are not set. Loading from .env file.");
    
    // If still not set after loading .env, throw error
    if (!config.profile && !(config.accessKey && config.secretKey)) {
      throw new Error("AWS credentials are not properly set. Either AWS_PROFILE or both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.");
    }
  }

  return config;
}
