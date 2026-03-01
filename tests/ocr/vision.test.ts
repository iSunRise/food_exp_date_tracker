import { describe, expect, it, vi } from "vitest";

import {
  DefaultVisionService,
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
} from "../../src/ocr/vision.js";
import type { LlmClient } from "../../src/shared/interfaces.js";

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<A, R>>
    : T[K];
};

function createLlmMock(content: string): Mocked<LlmClient> {
  return {
    chatCompletion: vi.fn(async () => ({
      content: "{}",
      usage: { promptTokens: 0, completionTokens: 0 },
      model: "unused",
    })),
    visionCompletion: vi.fn(async () => ({
      content,
      usage: { promptTokens: 12, completionTokens: 8 },
      model: "openrouter/test-model",
    })),
  };
}

describe("DefaultVisionService", () => {
  it("encodes image as base64, calls LLM, and parses successful extraction", async () => {
    const llm = createLlmMock(
      JSON.stringify({
        productName: "Milk",
        expiryDate: "2026-03-10",
        confidence: 0.92,
        rawDateText: "Best before 10.03.2026",
        notes: "best before label",
      }),
    );
    const service = new DefaultVisionService(llm);
    const image = Buffer.from("fake-image-bytes");

    const result = await service.extractExpiryDate(image, "image/jpeg");

    expect(llm.visionCompletion).toHaveBeenCalledTimes(1);
    expect(llm.visionCompletion).toHaveBeenCalledWith({
      systemPrompt: OCR_SYSTEM_PROMPT,
      userPrompt: OCR_USER_PROMPT,
      imageBase64: image.toString("base64"),
      mimeType: "image/jpeg",
      temperature: 0,
      maxTokens: 400,
    });
    expect(result).toEqual({
      success: true,
      productName: "Milk",
      expiryDate: "2026-03-10",
      confidence: 0.92,
      rawDateText: "Best before 10.03.2026",
      notes: "best before label",
      error: null,
    });
  });

  it("extracts JSON when wrapped in markdown code fences", async () => {
    const llm = createLlmMock(`\`\`\`json
{
  "productName": "Cheese",
  "expiryDate": "31.03.2026",
  "confidence": 0.75,
  "rawDateText": "31.03.2026",
  "notes": "Date appears next to BB"
}
\`\`\``);
    const service = new DefaultVisionService(llm);

    const result = await service.extractExpiryDate(Buffer.from("x"), "image/png");

    expect(result.success).toBe(true);
    expect(result.expiryDate).toBe("2026-03-31");
    expect(result.productName).toBe("Cheese");
  });

  it("returns success with null date when no expiry date is found", async () => {
    const llm = createLlmMock(
      JSON.stringify({
        productName: "Yogurt",
        expiryDate: null,
        confidence: 0.31,
        rawDateText: null,
        notes: "No visible expiry date in the image.",
      }),
    );
    const service = new DefaultVisionService(llm);

    const result = await service.extractExpiryDate(Buffer.from("x"), "image/png");

    expect(result).toEqual({
      success: true,
      productName: "Yogurt",
      expiryDate: null,
      confidence: 0.31,
      rawDateText: null,
      notes: "No visible expiry date in the image.",
      error: null,
    });
  });

  it("returns structured failure when LLM returns malformed JSON", async () => {
    const llm = createLlmMock('{"productName":"Milk","expiryDate":"2026-03-10",');
    const service = new DefaultVisionService(llm);

    const result = await service.extractExpiryDate(Buffer.from("x"), "image/png");

    expect(result).toEqual({
      success: false,
      productName: null,
      expiryDate: null,
      confidence: 0,
      rawDateText: null,
      notes: null,
      error: "Vision model did not return a JSON object.",
    });
  });

  it("returns structured failure when JSON shape is invalid", async () => {
    const llm = createLlmMock(
      JSON.stringify({
        productName: "Milk",
        expiryDate: "2026-03-10",
        confidence: "high",
        rawDateText: "10.03.2026",
        notes: null,
      }),
    );
    const service = new DefaultVisionService(llm);

    const result = await service.extractExpiryDate(Buffer.from("x"), "image/png");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vision model returned JSON with an unexpected shape.");
  });

  it("propagates llm client errors", async () => {
    const llm: Mocked<LlmClient> = {
      chatCompletion: vi.fn(async () => ({
        content: "{}",
        usage: { promptTokens: 0, completionTokens: 0 },
        model: "unused",
      })),
      visionCompletion: vi.fn(async () => {
        throw new Error("rate limit");
      }),
    };
    const service = new DefaultVisionService(llm);

    await expect(
      service.extractExpiryDate(Buffer.from("x"), "image/png"),
    ).rejects.toThrow("rate limit");
  });
});
