import json
import logging
import base64
import os
import webbrowser
import io
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import boto3
from botocore.exceptions import ClientError
from mcp import McpError
from mcp.server.fastmcp import FastMCP, Context, Image
from PIL import Image as PILImage
from credentials import get_aws_credentials

# Set logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Get AWS credentials
aws_creds = get_aws_credentials()

MODEL_ID = aws_creds['model_id']

# Set image save directory
IMAGE_DIR = aws_creds['images_dir']
os.makedirs(IMAGE_DIR, exist_ok=True)
logger.info(f"Image save directory: {IMAGE_DIR}")

# Create Bedrock client
BEDROCK_CLIENT = boto3.client(
    service_name='bedrock-runtime',
    region_name=aws_creds['region'],
    aws_access_key_id=aws_creds['access_key'],
    aws_secret_access_key=aws_creds['secret_key']
)

# Create MCP server
mcp = FastMCP("NovaCanvas 서버", port=int(aws_creds['port']))

# Define error class
class ImageError(Exception):
    "Custom exception for errors returned by Amazon Nova Canvas"

    def __init__(self, message):
        self.message = message

def generate_image(body):
    """
    Use Amazon Nova Canvas model to generate an image.
    
    Args:
        body (str): Request body
        
    Returns:
        bytes: Image generated by the model
    """
    logger.info(f"Generating image with Amazon Nova Canvas model {MODEL_ID}")

    accept = "application/json"
    content_type = "application/json"

    try:
        response = BEDROCK_CLIENT.invoke_model(
            body=body, modelId=MODEL_ID, accept=accept, contentType=content_type
        )
        
        response_body = json.loads(response.get("body").read())
        base64_image = response_body.get("images")[0]
        base64_bytes = base64_image.encode('ascii')
        image_bytes = base64.b64decode(base64_bytes)

        finish_reason = response_body.get("error")
        if finish_reason is not None:
            raise ImageError(f"Image generation error. Error: {finish_reason}")

        logger.info(f"Successfully generated image with Amazon Nova Canvas model {MODEL_ID}")
        return image_bytes
        
    except ClientError as err:
        message = err.response["Error"]["Message"]
        logger.error(f"Client error occurred: {message}")
        raise ImageError(f"Client error occurred: {message}")

def save_image(image_bytes, prefix="image", open_browser=True):
    """
    Save image to specified directory.
    
    Args:
        image_bytes (bytes): Image byte data
        prefix (str): File name prefix
        
    Returns:
        Dict: Image file path and data information
    """
    # Create unique file name using timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{timestamp}.png"
    filepath = os.path.join(IMAGE_DIR, filename)
    
    # Save image to file
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    
    # Log file path
    logger.info(f"Image saved: {filepath}")
    
    # Encode generated image to base64
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Open image in browser
    if open_browser:
        try:
            webbrowser.open(f"file://{filepath}")
            logger.info("Opened image in browser")
        except Exception as e:
            logger.warning(f"Failed to open image in browser: {e}")
    
    return {
        "image_path": filepath,
        "image_base64": image_base64,
        "filename": filename
    }

# Text-to-image generation tool
@mcp.tool()
async def text_to_image(
    prompt: str,
    negative_prompt: str = "",
    height: int = 1024,
    width: int = 1024,
    num_images: int = 1,
    cfg_scale: float = 8.0,
    seed: int = 0,
    open_browser: bool = True,
) -> Dict[str, Any]:
    """
    Generate an image from a text prompt. After generation, you can use the show_image tool to view the thumbnail.
    
    Args:
        prompt: Text prompt for generating an image (maximum 1024 characters)
        negative_prompt: Text prompt for excluding attributes from generation (maximum 1024 characters)
        height: Image height (pixels)
        width: Image width (pixels)
        num_images: Number of images to generate (maximum 4)
        cfg_scale: Image matching degree for the prompt (1-20)
        seed: Seed value for image generation
        open_browser: Whether to open the image in the browser after generation
        
    Returns:
        Dict: Dictionary containing the file path of the generated image and the thumbnail image
    """
    try:
        # Validate prompt length
        if len(prompt) > 1024:
            raise ImageError("Prompt cannot exceed 1024 characters.")
        if len(negative_prompt) > 1024:
            raise ImageError("Negative prompt cannot exceed 1024 characters.")
            
        if num_images < 1 or num_images > 4:
            raise ImageError("num_images must be between 1 and 4.")
        
        body = json.dumps({
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": prompt,
                "negativeText": negative_prompt
            },
            "imageGenerationConfig": {
                "numberOfImages": num_images,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale,
                "seed": seed
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="text2img", open_browser=open_browser)
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Image generated successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while generating image: {str(e)}")

# Inpainting tool
@mcp.tool()
async def inpainting(
    image_path: str,
    prompt: str,
    mask_prompt: str,
    negative_prompt: str = "",
    height: int = 512,
    width: int = 512,
    cfg_scale: float = 8.0,
    open_browser: bool = True,
) -> Dict[str, Any]:
    """
    Inpaint a specific part of an image using a text mask prompt.
    
    Args:
        image_path: File path of the original image
        prompt: Text prompt for the area to be inpainted
        mask_prompt: Text prompt for specifying the area to be masked (e.g., "window", "car")
        negative_prompt: Text prompt for excluding attributes from generation
        height: Output image height (pixels)
        width: Output image width (pixels)
        cfg_scale: Image matching degree for the prompt (1-20)
        open_browser: Whether to open the image in the browser after generation
        
    Returns:
        Dict: Dictionary containing the file path of the inpainted image
    """
    try:
        # Read image file and encode to base64
        with open(image_path, "rb") as image_file:
            input_image = base64.b64encode(image_file.read()).decode('utf8')
        
        body = json.dumps({
            "taskType": "INPAINTING",
            "inPaintingParams": {
                "text": prompt,
                "negativeText": negative_prompt,
                "image": input_image,
                "maskPrompt": mask_prompt
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="inpaint", open_browser=open_browser)
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Inpainting completed successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while inpainting: {str(e)}")

# Outpainting tool
@mcp.tool()
async def outpainting(
    image_path: str,
    mask_image_path: str,
    prompt: str,
    negative_prompt: str = "",
    outpainting_mode: str = "DEFAULT",
    height: int = 512,
    width: int = 512,
    cfg_scale: float = 8.0,
) -> Dict[str, Any]:
    """
    Expand the image to create an outpainting.
    
    Args:
        image_path: File path of the original image
        mask_image_path: File path of the mask image
        prompt: Text describing the content to be generated in the outpainting area
        negative_prompt: Text specifying attributes to exclude from generation
        outpainting_mode: Outpainting mode (DEFAULT or PRECISE)
        height: Output image height (pixels)
        width: Output image width (pixels)
        cfg_scale: Prompt matching degree (1-20)
        
    Returns:
        Dict: Dictionary containing the file path of the outpainted image
    """
    try:
        # Validate outpainting mode
        if outpainting_mode not in ["DEFAULT", "PRECISE"]:
            raise ImageError("outpainting_mode must be 'DEFAULT' or 'PRECISE'.")
        
        # Read image file and encode to base64
        with open(image_path, "rb") as image_file:
            input_image = base64.b64encode(image_file.read()).decode('utf8')
        
        with open(mask_image_path, "rb") as mask_file:
            input_mask_image = base64.b64encode(mask_file.read()).decode('utf8')
        
        body = json.dumps({
            "taskType": "OUTPAINTING",
            "outPaintingParams": {
                "text": prompt,
                "negativeText": negative_prompt,
                "image": input_image,
                "maskImage": input_mask_image,
                "outPaintingMode": outpainting_mode
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="outpaint")
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Outpainting completed successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while outpainting: {str(e)}")

# Image variation tool
@mcp.tool()
async def image_variation(
    image_paths: List[str],
    prompt: str = "",
    negative_prompt: str = "",
    similarity_strength: float = 0.7,
    height: int = 512,
    width: int = 512,
    cfg_scale: float = 8.0,
) -> Dict[str, Any]:
    """
    Generate a new variation of the input image while maintaining its content.
    
    Args:
        image_paths: List of file paths of the original images (1-5)
        prompt: Text for generating a variation image (optional)
        negative_prompt: Text specifying attributes to exclude from generation
        similarity_strength: Similarity between the original image and the generated image (0.2-1.0)
        height: Output image height (pixels)
        width: Output image width (pixels)
        cfg_scale: Prompt matching degree (1-20)
        
    Returns:
        Dict: Dictionary containing the file path of the variation image
    """
    try:
        # Validate image paths
        if len(image_paths) < 1 or len(image_paths) > 5:
            raise ImageError("image_paths list must contain 1-5 images.")
        
        if similarity_strength < 0.2 or similarity_strength > 1.0:
            raise ImageError("similarity_strength must be between 0.2 and 1.0.")
        
        # Read image files and encode to base64
        encoded_images = []
        for img_path in image_paths:
            with open(img_path, "rb") as image_file:
                encoded_images.append(base64.b64encode(image_file.read()).decode('utf8'))
        
        body = json.dumps({
            "taskType": "IMAGE_VARIATION",
            "imageVariationParams": {
                "text": prompt,
                "negativeText": negative_prompt,
                "images": encoded_images,
                "similarityStrength": similarity_strength,
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="variation")
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Image variation completed successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while image variation: {str(e)}")

# Image conditioning tool
@mcp.tool()
async def image_conditioning(
    image_path: str,
    prompt: str,
    negative_prompt: str = "",
    control_mode: str = "CANNY_EDGE",
    height: int = 512,
    width: int = 512,
    cfg_scale: float = 8.0,
) -> Dict[str, Any]:
    """
    Generate an image that follows the layout and composition of a reference image.
    
    Args:
        image_path: File path of the reference image
        prompt: Text describing the image to be generated
        negative_prompt: Text specifying attributes to exclude from generation
        control_mode: Control mode (CANNY_EDGE, etc.)
        height: Output image height (pixels)
        width: Output image width (pixels)
        cfg_scale: Prompt matching degree (1-20)
        
    Returns:
        Dict: Dictionary containing the file path of the generated image
    """
    try:
        # Read image file and encode to base64
        with open(image_path, "rb") as image_file:
            input_image = base64.b64encode(image_file.read()).decode('utf8')
        
        body = json.dumps({
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": prompt,
                "negativeText": negative_prompt,
                "conditionImage": input_image,
                "controlMode": control_mode
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="condition")
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Image conditioning completed successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while image conditioning: {str(e)}")

# Color guided generation tool
@mcp.tool()
async def color_guided_generation(
    prompt: str,
    colors: List[str],
    reference_image_path: Optional[str] = None,
    negative_prompt: str = "",
    height: int = 512,
    width: int = 512,
    cfg_scale: float = 8.0,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Generate an image using a specified color palette.
    
    Args:
        prompt: Text describing the image to be generated
        colors: List of color codes (1-10 hex color codes, e.g., "#ff8080")
        reference_image_path: File path of the reference image (optional)
        negative_prompt: Text specifying attributes to exclude from generation
        height: Output image height (pixels)
        width: Output image width (pixels)
        cfg_scale: Prompt matching degree (1-20)
        ctx: MCP context
        
    Returns:
        Dict: Dictionary containing the file path of the generated image
    """
    try:
        # Validate color list
        if len(colors) < 1 or len(colors) > 10:
            raise ImageError("colors list must contain 1-10 color codes.")
        
        # Validate color codes
        for color in colors:
            if not color.startswith("#") or len(color) != 7:
                raise ImageError(f"Invalid color code: {color}. Hex color codes must be in the format '#rrggbb'.")
        
        params = {
            "text": prompt,
            "negativeText": negative_prompt,
            "colors": colors
        }
        
        # If reference image exists, add it
        if reference_image_path:
            with open(reference_image_path, "rb") as image_file:
                input_image = base64.b64encode(image_file.read()).decode('utf8')
                params["referenceImage"] = input_image
        
        body = json.dumps({
            "taskType": "COLOR_GUIDED_GENERATION",
            "colorGuidedGenerationParams": params,
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": height,
                "width": width,
                "cfgScale": cfg_scale
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="color_guided")
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Image generated successfully using color palette. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while generating image using color palette: {str(e)}")

# Background removal tool
@mcp.tool()
async def background_removal(
    image_path: str,
    ctx: Context = None,
) -> Dict[str, Any]:
    """
    Remove the background of an image automatically.
    
    Args:
        image_path: File path of the original image
        ctx: MCP context
        
    Returns:
        Dict: Dictionary containing the file path of the image with the background removed
    """
    try:
        # Read image file and encode to base64
        with open(image_path, "rb") as image_file:
            input_image = base64.b64encode(image_file.read()).decode('utf8')
        
        body = json.dumps({
            "taskType": "BACKGROUND_REMOVAL",
            "backgroundRemovalParams": {
                "image": input_image,
            }
        })
        
        # Generate image
        image_bytes = generate_image(body)
        
        # Save image
        image_info = save_image(image_bytes, prefix="bg_removed")
        
        # Generate result
        result = {
            "image_path": image_info["image_path"],
            "message": f"Background removed successfully. Saved location: {image_info['image_path']}"
        }
        
        return result
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while removing background: {str(e)}")

# Image resource processing
@mcp.resource("image://{image_id}")
async def get_image(image_id: str) -> bytes:
    """
    Get an image by image ID.
    
    Args:
        image_id: Image ID
        
    Returns:
        bytes: Image data
    """
    try:
        # Here, we assume image_id is a file path.
        with open(image_id, "rb") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Image load error: {e}")
        raise McpError(f"Unable to load image: {str(e)}")

@mcp.tool()
def show_image(image_path: str, width: int = 500, height: int = 500) -> Image:
    """
    Create a thumbnail of the image and return it. The maximum size is 1048578.
    Supports URLs or local file paths.
    
    Args:
        image_path: Image URL or local file path
        width: Output image width (pixels)
        height: Output image height (pixels)
        
    Returns:
        Image: Thumbnail image
    """
    try:
        # Check if image_path is a URL or local file path
        if image_path.startswith('http://') or image_path.startswith('https://'):
            # Download image from URL
            response = requests.get(image_path, stream=True)
            if response.status_code != 200:
                raise ImageError(f"Failed to download image: {response.status_code}")
            
            # Create image object
            img = PILImage.open(io.BytesIO(response.content))
        else:
            # Read local file
            try:
                img = PILImage.open(image_path)
            except FileNotFoundError:
                raise ImageError(f"Image file not found: {image_path}")
        
        # Create thumbnail
        img.thumbnail((width, height))
        
        # Convert RGBA image to RGB (if necessary)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        
        # Convert image to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        
        # Return image object
        return Image(data=img_bytes.getvalue(), format="png")
        
    except ImageError as e:
        raise McpError(str(e.message))
    except Exception as e:
        raise McpError(f"Error occurred while displaying image: {str(e)}")

def main():
    print("\n" + "="*50)
    print(f"MODEL_ID: {MODEL_ID}")
    print(f"IMAGE_DIR: {IMAGE_DIR}")
    print(f"Press Ctrl+C to exit.")
    print(f"Starting NovaCanvas server...")
    print("="*50 + "\n")

    mcp.run()

if __name__ == "__main__":
    main()