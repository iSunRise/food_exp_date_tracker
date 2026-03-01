import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendMock,
  getSignedUrlMock,
  clientConfigStore,
} = vi.hoisted(() => ({
  sendMock: vi.fn(async () => undefined),
  getSignedUrlMock: vi.fn(async () => "https://signed.example/url"),
  clientConfigStore: [] as unknown[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    public send = sendMock;

    constructor(config: unknown) {
      clientConfigStore.push(config);
    }
  }

  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

import {
  DEFAULT_PRESIGNED_URL_EXPIRY,
  S3ImageStorageService,
} from "../../src/image-storage/client.js";

describe("S3ImageStorageService", () => {
  beforeEach(() => {
    sendMock.mockClear();
    sendMock.mockResolvedValue(undefined);
    getSignedUrlMock.mockClear();
    getSignedUrlMock.mockResolvedValue("https://signed.example/url");
    clientConfigStore.length = 0;
  });

  it("configures S3 client with endpoint and path style options", () => {
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      forcePathStyle: true,
    });

    expect(service).toBeDefined();
    expect(clientConfigStore[0]).toEqual({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
      },
    });
  });

  it("uploads image bytes and returns key derived from mime type", async () => {
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });

    const key = await service.upload({
      chatId: "chat-1",
      itemId: "item-1",
      buffer: Buffer.from("img"),
      mimeType: "image/jpeg",
    });

    expect(key).toBe("chat-1/item-1.jpg");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as { input: unknown };
    expect(command.input).toEqual({
      Bucket: "food-photos",
      Key: "chat-1/item-1.jpg",
      Body: Buffer.from("img"),
      ContentType: "image/jpeg",
    });
  });

  it("maps supported mime types and falls back to .bin", async () => {
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });

    const cases: Array<[string, string]> = [
      ["image/jpeg", ".jpg"],
      ["image/png", ".png"],
      ["image/webp", ".webp"],
      ["image/gif", ".gif"],
      ["image/heic", ".heic"],
      ["image/bmp", ".bmp"],
      ["image/tiff", ".tiff"],
      ["application/octet-stream", ".bin"],
    ];

    for (const [mimeType, expectedExtension] of cases) {
      sendMock.mockClear();

      const key = await service.upload({
        chatId: "chat-5",
        itemId: "item-5",
        buffer: Buffer.from("img"),
        mimeType,
      });

      expect(key).toBe(`chat-5/item-5${expectedExtension}`);
    }
  });

  it("generates presigned get url with default expiry", async () => {
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });

    const url = await service.getUrl("chat-1/item-1.jpg");

    expect(url).toBe("https://signed.example/url");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, command, options] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: unknown },
      { expiresIn: number },
    ];
    expect(command.input).toEqual({
      Bucket: "food-photos",
      Key: "chat-1/item-1.jpg",
    });
    expect(options.expiresIn).toBe(DEFAULT_PRESIGNED_URL_EXPIRY);
  });

  it("deletes object and does not throw on S3 failure", async () => {
    const logger = {
      error: vi.fn(),
    };
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      logger,
    });

    sendMock.mockRejectedValueOnce(new Error("delete failed"));

    await expect(service.delete("chat-1/item-1.jpg")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("throws and logs when upload fails", async () => {
    const logger = {
      error: vi.fn(),
    };
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      logger,
    });

    sendMock.mockRejectedValueOnce(new Error("upload failed"));

    await expect(
      service.upload({
        chatId: "chat-2",
        itemId: "item-2",
        buffer: Buffer.from("img"),
        mimeType: "image/png",
      }),
    ).rejects.toThrow("upload failed");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("throws and logs when presigned url generation fails", async () => {
    const logger = {
      error: vi.fn(),
    };
    const service = new S3ImageStorageService({
      bucket: "food-photos",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      logger,
    });

    getSignedUrlMock.mockRejectedValueOnce(new Error("presign failed"));

    await expect(service.getUrl("chat-1/item-3.jpg")).rejects.toThrow(
      "presign failed",
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
