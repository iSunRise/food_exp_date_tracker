import * as v from "valibot";

import type { LlmClient, VisionService } from "../shared/interfaces.js";
import { ExtractionResultSchema } from "../shared/schemas.js";
import type { ExtractionResult } from "../shared/types.js";

const OCR_SYSTEM_PROMPT = `You extract product expiration data from food label images.
You must return only valid JSON with this exact shape:
{
  "productName": "string or null",
  "expiryDate": "YYYY-MM-DD or null",
  "confidence": 0.0 to 1.0,
  "rawDateText": "exact date text seen on label or null",
  "notes": "short context or null"
}

Rules:
- Identify the product name (best guess if partial).
- Find expiry/best-before/use-by date, not manufacturing date.
- If multiple dates exist, choose expiry date and explain ambiguity in notes.
- If no expiry date is visible, set expiryDate to null and explain in notes.
- Normalize date to YYYY-MM-DD whenever possible.
- Return JSON only, with no markdown fences or extra text.`;

const OCR_USER_PROMPT = `Analyze this food label image and extract product name and expiration date.
Consider formats like MM/DD/YYYY, DD.MM.YYYY, YYYY-MM-DD, and month-name formats.
Return only the JSON object described in the system instructions.`;

const RawOcrResponseSchema = v.object({
  productName: v.optional(v.nullable(v.string()), null),
  expiryDate: v.optional(v.nullable(v.string()), null),
  confidence: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
  rawDateText: v.optional(v.nullable(v.string()), null),
  notes: v.optional(v.nullable(v.string()), null),
});

type RawOcrResponse = v.InferOutput<typeof RawOcrResponseSchema>;

const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export class DefaultVisionService implements VisionService {
  private readonly llmClient: LlmClient;

  constructor(llmClient: LlmClient) {
    this.llmClient = llmClient;
  }

  async extractExpiryDate(image: Buffer, mimeType: string): Promise<ExtractionResult> {
    const imageBase64 = image.toString("base64");

    const completion = await this.llmClient.visionCompletion({
      systemPrompt: OCR_SYSTEM_PROMPT,
      userPrompt: OCR_USER_PROMPT,
      imageBase64,
      mimeType,
      temperature: 0,
      maxTokens: 400,
    });

    const payload = this.parseLlmPayload(completion.content);
    if (!payload.success) {
      return payload.output;
    }

    return this.toExtractionResult(payload.output);
  }

  private parseLlmPayload(content: string):
    | { success: true; output: RawOcrResponse }
    | { success: false; output: ExtractionResult } {
    const jsonObject = extractJsonObject(content);

    if (!jsonObject) {
      return {
        success: false,
        output: this.buildFailure("Vision model did not return a JSON object."),
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonObject);
    } catch {
      return {
        success: false,
        output: this.buildFailure("Vision model returned malformed JSON."),
      };
    }

    const validated = v.safeParse(RawOcrResponseSchema, parsedJson);
    if (!validated.success) {
      return {
        success: false,
        output: this.buildFailure("Vision model returned JSON with an unexpected shape."),
      };
    }

    return {
      success: true,
      output: validated.output,
    };
  }

  private toExtractionResult(payload: RawOcrResponse): ExtractionResult {
    const normalizedExpiryDate = normalizeExpiryDate(payload.expiryDate);

    if (payload.expiryDate !== null && normalizedExpiryDate === null) {
      return this.buildFailure("Could not normalize extracted expiry date.");
    }

    const candidate: ExtractionResult = {
      success: true,
      productName: payload.productName,
      expiryDate: normalizedExpiryDate,
      confidence: payload.confidence,
      rawDateText: payload.rawDateText,
      notes: payload.notes,
      error: null,
    };

    const validated = v.safeParse(ExtractionResultSchema, candidate);
    if (!validated.success) {
      return this.buildFailure("Extracted payload is invalid.");
    }

    return validated.output;
  }

  private buildFailure(error: string): ExtractionResult {
    return {
      success: false,
      productName: null,
      expiryDate: null,
      confidence: 0,
      rawDateText: null,
      notes: null,
      error,
    };
  }
}

function extractJsonObject(content: string): string | null {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
}

function normalizeExpiryDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const input = value.trim();
  if (input.length === 0) {
    return null;
  }

  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return normalizeYmd(year, month, day);
  }

  const numericMatch = input.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (numericMatch) {
    const left = Number(numericMatch[1]);
    const middle = Number(numericMatch[2]);
    const right = Number(numericMatch[3]);
    const separator = input.includes(".") ? "." : input.includes("/") ? "/" : "-";

    if (numericMatch[1].length === 4) {
      return normalizeYmd(left, middle, right);
    }

    if (numericMatch[3].length === 4 || numericMatch[3].length === 2) {
      const year = normalizeYear(right);
      if (year === null) {
        return null;
      }

      if (left > 12 && middle <= 12) {
        return normalizeYmd(year, middle, left);
      }

      if (middle > 12 && left <= 12) {
        return normalizeYmd(year, left, middle);
      }

      if (separator === "/") {
        return normalizeYmd(year, left, middle);
      }

      return normalizeYmd(year, middle, left);
    }
  }

  const monthYearMatch = input.match(
    /^([A-Za-z]+)\s+(\d{4})$|^(\d{4})\s+([A-Za-z]+)$/i,
  );
  if (monthYearMatch) {
    const monthToken = (monthYearMatch[1] ?? monthYearMatch[4] ?? "").toLowerCase();
    const yearToken = monthYearMatch[2] ?? monthYearMatch[3] ?? "";
    const month = MONTH_MAP[monthToken];
    const year = Number(yearToken);

    if (month) {
      const day = lastDayOfMonth(year, month);
      return normalizeYmd(year, month, day);
    }
  }

  const textualMatch = input.match(
    /^(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{4})$|^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i,
  );
  if (textualMatch) {
    const dayToken = textualMatch[1] ?? textualMatch[5];
    const monthToken = (textualMatch[2] ?? textualMatch[4] ?? "").toLowerCase();
    const yearToken = textualMatch[3] ?? textualMatch[6];
    const day = dayToken ? Number(dayToken) : NaN;
    const year = yearToken ? Number(yearToken) : NaN;
    const month = MONTH_MAP[monthToken];

    if (month && Number.isFinite(day) && Number.isFinite(year)) {
      return normalizeYmd(year, month, day);
    }
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatYmd(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function normalizeYear(value: number): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  if (value >= 1000) {
    return value;
  }

  if (value >= 0 && value <= 99) {
    return 2000 + value;
  }

  return null;
}

function normalizeYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  const maxDay = lastDayOfMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return formatYmd(year, month, day);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(year: number, month: number, day: number): string {
  const yearValue = String(year).padStart(4, "0");
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  return `${yearValue}-${monthValue}-${dayValue}`;
}

export { OCR_SYSTEM_PROMPT, OCR_USER_PROMPT };
