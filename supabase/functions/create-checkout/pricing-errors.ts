import { PricingValidationError } from "../_shared/pricing.ts";
import { errorResponse } from "./responses.ts";

export function mapPricingError(
  requestId: string,
  error: PricingValidationError,
  corsHeaders: Record<string, string>,
): Response {
  const code = error.code.toUpperCase();

  if (code.startsWith("PROMO_")) {
    return errorResponse(
      requestId,
      error.status,
      "promo_invalid",
      error.message,
      corsHeaders,
    );
  }

  if (code.startsWith("CREDIT_")) {
    return errorResponse(
      requestId,
      error.status,
      "credit_invalid",
      error.message,
      corsHeaders,
    );
  }

  return errorResponse(
    requestId,
    error.status,
    "pricing_failed",
    error.message,
    corsHeaders,
  );
}
