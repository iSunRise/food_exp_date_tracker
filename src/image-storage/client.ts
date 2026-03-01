import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ImageStorageService } from "../shared/interfaces.js";
import type { ImageUploadParams } from "../shared/types.js";

export const DEFAULT_PRESIGNED_URL_EXPIRY = 3600;

interface LoggerLike {
  error(message: string, error?: unknown): void;
}

export interface S3ImageStorageServiceOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  presignedUrlExpiry?: number;
  forcePathStyle?: boolean;
  logger?: LoggerLike;
}

export class S3ImageStorageService implements ImageStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignedUrlExpiry: number;
  private readonly logger: LoggerLike;

  constructor(options: S3ImageStorageServiceOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });

    this.bucket = options.bucket;
    this.presignedUrlExpiry =
      options.presignedUrlExpiry ?? DEFAULT_PRESIGNED_URL_EXPIRY;
    this.logger = options.logger ?? console;
  }

  async upload(params: ImageUploadParams): Promise<string> {
    const extension = this.resolveExtension(params.mimeType);
    const key = `${params.chatId}/${params.itemId}${extension}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: params.buffer,
          ContentType: params.mimeType,
        }),
      );

      return key;
    } catch (error) {
      this.logger.error(`Failed to upload image to S3 with key ${key}`, error);
      throw error;
    }
  }

  async getUrl(key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn: this.presignedUrlExpiry },
      );
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for key ${key}`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete S3 object with key ${key}`, error);
    }
  }

  private resolveExtension(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      case "image/gif":
        return ".gif";
      case "image/heic":
        return ".heic";
      case "image/bmp":
        return ".bmp";
      case "image/tiff":
        return ".tiff";
      default:
        return ".bin";
    }
  }
}
