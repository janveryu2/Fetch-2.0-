import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();
vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Authentication required", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { GET as handleGetProfile } from "@/app/api/users/[username]/route";
import { POST as handleCreateLiveRoom } from "@/app/api/live/rooms/route";

describe("Phase 7: Friend Profiles, Messaging & Live Completion", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  describe("GET /api/users/[username] - Privacy Projection", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const req = new Request("http://localhost/api/users/alex_study");
      const res = await handleGetProfile(req, {
        params: Promise.resolve({ username: "alex_study" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 when user is not found", async () => {
      mockGetAuth.mockResolvedValue({
        userId: "u-me",
        supabase: {
          rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("User not found") }),
        },
      });

      const req = new Request("http://localhost/api/users/nonexistent");
      const res = await handleGetProfile(req, {
        params: Promise.resolve({ username: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns only public-safe fields and strictly excludes email/packs/sources/messages", async () => {
      const mockFriendProjection = {
        id: "u-friend-1",
        username: "sarah_bio",
        displayName: "Sarah Jenkins",
        avatarUrl: "https://example.com/avatar.png",
        friendshipStatus: "friend",
        canMessage: true,
        allowDirectMessages: true,
        education: "Undergraduate",
        program: "Biochemistry",
        subject: null, // show_subject was false
      };

      const mockRpc = vi.fn().mockResolvedValue({
        data: mockFriendProjection,
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-me",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/users/sarah_bio");
      const res = await handleGetProfile(req, {
        params: Promise.resolve({ username: "sarah_bio" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.profile).toBeDefined();

      // Allowed projection fields
      expect(body.profile.displayName).toBe("Sarah Jenkins");
      expect(body.profile.username).toBe("sarah_bio");
      expect(body.profile.friendshipStatus).toBe("friend");
      expect(body.profile.canMessage).toBe(true);
      expect(body.profile.education).toBe("Undergraduate");
      expect(body.profile.program).toBe("Biochemistry");
      expect(body.profile.subject).toBeNull();

      // Ensure no private fields leaked
      expect(body.profile.email).toBeUndefined();
      expect(body.profile.studyPacks).toBeUndefined();
      expect(body.profile.sources).toBeUndefined();
      expect(body.profile.answers).toBeUndefined();
      expect(body.profile.messages).toBeUndefined();
    });

    it("prevents messaging when recipient has disabled direct messages", async () => {
      const mockFriendProjection = {
        id: "u-friend-2",
        username: "quiet_learner",
        displayName: "Quiet Learner",
        avatarUrl: null,
        friendshipStatus: "friend",
        canMessage: false, // Disallowed because allowDirectMessages = false
        allowDirectMessages: false,
        education: null,
        program: null,
        subject: null,
      };

      mockGetAuth.mockResolvedValue({
        userId: "u-me",
        supabase: {
          rpc: vi.fn().mockResolvedValue({ data: mockFriendProjection, error: null }),
        },
      });

      const req = new Request("http://localhost/api/users/quiet_learner");
      const res = await handleGetProfile(req, {
        params: Promise.resolve({ username: "quiet_learner" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.profile.canMessage).toBe(false);
      expect(body.profile.allowDirectMessages).toBe(false);
    });
  });

  describe("POST /api/live/rooms - Live Quiz Room with Artifact Support", () => {
    it("creates a live room with packId and optional artifactId", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          roomId: "room-abc-123",
          joinCode: "7K9M2P",
          packId: "11111111-1111-4111-8111-111111111111",
          artifactId: "22222222-2222-4222-8222-222222222222",
          status: "lobby",
          questionCount: 10,
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-host",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/live/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId: "11111111-1111-4111-8111-111111111111",
          artifactId: "22222222-2222-4222-8222-222222222222",
        }),
      });

      const res = await handleCreateLiveRoom(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.roomId).toBe("room-abc-123");
      expect(body.joinCode).toBe("7K9M2P");
      expect(mockRpc).toHaveBeenCalledWith("create_live_room_configured", {
        p_visibility: "private",
        p_max_players: 4,
        p_pack_id: "11111111-1111-4111-8111-111111111111",
        p_artifact_id: "22222222-2222-4222-8222-222222222222",
      });
    });

    it("rejects invalid packId with 400", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-host", supabase: {} });

      const req = new Request("http://localhost/api/live/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: "not-a-uuid" }),
      });

      const res = await handleCreateLiveRoom(req);
      expect(res.status).toBe(400);
    });
  });
});
