import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Sign in to use account features.", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { POST as createLiveRoom } from "@/app/api/live/rooms/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import { EDITORIAL_FEATURES, getAvailabilityBadgeProps } from "@/lib/feature-availability";

const VALID_USER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PACK_ID = "22222222-2222-4222-8222-222222222222";
const VALID_PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";

describe("Phase 1 - Critical Truth & Contract Repairs", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  describe("Live Competition Contract", () => {
    it("calls create_live_room with owner-validated pack ID and returns 201", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          roomId: "44444444-4444-4444-8444-444444444444",
          joinCode: "ABC789",
          packId: VALID_PACK_ID,
          status: "lobby",
          questionCount: 5,
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/live/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: VALID_PACK_ID }),
      });

      const res = await createLiveRoom(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.joinCode).toBe("ABC789");
      expect(mockRpc).toHaveBeenCalledWith("create_live_room", {
        p_pack_id: VALID_PACK_ID,
      });
    });

    it("surfaces database error if study pack is unowned or missing", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Study pack not found or access denied." },
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/live/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: VALID_PACK_ID }),
      });

      const res = await createLiveRoom(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Study pack not found or access denied.");
    });
  });

  describe("Messages Direct Conversation Contract", () => {
    it("rejects undefined or invalid participant ID with stable error message", async () => {
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: vi.fn() },
      });

      const req = new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: undefined }),
      });

      const res = await createConversation(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid participant ID.");
    });

    it("creates or reuses direct conversation with valid friend UUID", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: "55555555-5555-4555-8555-555555555555",
          participant: {
            id: VALID_PARTICIPANT_ID,
            username: "studybuddy",
            displayName: "Study Buddy",
            avatarUrl: null,
          },
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: VALID_PARTICIPANT_ID }),
      });

      const res = await createConversation(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.conversation.id).toBe("55555555-5555-4555-8555-555555555555");
      expect(mockRpc).toHaveBeenCalledWith("get_or_create_direct_conversation", {
        p_participant_id: VALID_PARTICIPANT_ID,
      });
    });
  });

  describe("Feature Availability Truth", () => {
    it("reports PDF document intake as account feature, not coming soon", () => {
      expect(EDITORIAL_FEATURES.pdf_link_intake.status).toBe("account");
      expect(getAvailabilityBadgeProps(EDITORIAL_FEATURES.pdf_link_intake.status).label).toBe("Account feature");
    });

    it("reports Multiplayer Live rooms as account feature", () => {
      expect(EDITORIAL_FEATURES.multiplayer_rooms.status).toBe("account");
      expect(EDITORIAL_FEATURES.multiplayer_rooms.badgeLabel).toBe("Account feature");
    });

    it("reports Friends & Messages as account feature", () => {
      expect(EDITORIAL_FEATURES.friends_social.status).toBe("account");
      expect(EDITORIAL_FEATURES.friends_social.badgeLabel).toBe("Account feature");
    });
  });
});
