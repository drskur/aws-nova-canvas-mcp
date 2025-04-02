import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAppConfig } from "./config";

// Get configuration
const conf = getAppConfig();
const MODEL_ID = conf.modelId;

// Import tool functions
import { backgroundRemoval, BackgroundRemovalSchema } from "./tools/background_removal";
import { textToImage, TextToImageSchema } from "./tools/text_to_image";
import { inpainting, InpaintingSchema } from "./tools/inpainting";
import { outpainting, OutpaintingSchema } from "./tools/outpainting";
import { imageVariation, ImageVariationSchema } from "./tools/image_variation";
import { imageConditioning, ImageConditioningSchema } from "./tools/image_conditioning";
import { colorGuidedGeneration, ColorGuidedGenerationSchema } from "./tools/color_guided_generation";

// Import image utility
import { getImage } from "./utils/image";

// Create MCP server
const mcp = new McpServer({
  name: "NovaCanvas Server",
  version: "0.0.1",
  port: conf.port
});

// Register tools
mcp.tool(
  "text_to_image",
  "Generate an image from text prompt",
  TextToImageSchema.shape,
  textToImage
);

mcp.tool(
  "inpainting",
  "Edit specific areas of an image based on a text prompt",
  InpaintingSchema.shape,
  inpainting
);

mcp.tool(
  "outpainting",
  "Extend an image beyond its original boundaries",
  OutpaintingSchema.shape,
  outpainting
);

mcp.tool(
  "image_variation",
  "Generate variations of an image",
  ImageVariationSchema.shape,
  imageVariation
);

mcp.tool(
  "image_conditioning",
  "Generate an image based on a reference image and prompt",
  ImageConditioningSchema.shape,
  imageConditioning
);

mcp.tool(
  "color_guided_generation",
  "Generate an image guided by specific colors",
  ColorGuidedGenerationSchema.shape,
  colorGuidedGeneration
);

mcp.tool(
  "background_removal",
  "Remove the background from an image",
  BackgroundRemovalSchema.shape,
  backgroundRemoval
);

async function main() {
  // console.log("\n" + "=".repeat(50));
  // console.log(`MODEL_ID: ${MODEL_ID}`);
  // console.log(`Press Ctrl+C to exit.`);
  // console.log(`Starting NovaCanvas server...`);
  // console.log("=".repeat(50) + "\n");

  const treansport = new StdioServerTransport();
  await mcp.connect(treansport);
}

main().catch(console.error);