/**
 * Custom exception for errors returned by Amazon Nova Canvas
 */
export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}
