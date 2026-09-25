import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { deleteUserAccountServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";
import { z } from "zod";

const deleteAccountSchema = z.object({
  confirmation: z.string().refine((val) => val.trim().toUpperCase() === "DELETE", {
    message: "Confirmation must be 'DELETE' to permanently delete your account.",
  }),
});

export async function POST(request: NextRequest) {
  const context = await getAuthenticatedRequestContext();
  if (!context) {
    return unauthorizedResponse("Authentication required to delete account.");
  }

  const { userId } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "INVALID_JSON",
      "Request body must be valid JSON with confirmation: 'DELETE'.",
      400
    );
  }

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "CONFIRMATION_REQUIRED",
      parsed.error.issues[0]?.message || "Confirmation string 'DELETE' is required.",
      400
    );
  }

  const result = await deleteUserAccountServer(userId);
  if (!result.success) {
    return createApiErrorResponse(
      "ACCOUNT_DELETION_FAILED",
      result.error?.message || "Failed to permanently delete account.",
      500
    );
  }

  return NextResponse.json({
    success: true,
    message: "Your account and all associated study data have been permanently deleted.",
  });
}
