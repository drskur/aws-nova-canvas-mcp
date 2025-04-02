export interface Tool {
  name: string;
  description: string;
  handler: Function;
}

export interface ResourceHandler {
  pattern: RegExp;
  handler: (params: any) => Promise<Buffer>;
}

export interface ImageResponse {
  imageId: string;
  imagePath: string;
  url?: string;
}
