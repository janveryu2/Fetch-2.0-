import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Sign in to use account features.", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { GET as getFriends } from "@/app/api/friends/route";
import { DELETE as deleteFriend } from "@/app/api/friends/[friendId]/route";
import { GET as getRequests, POST as sendRequest } from "@/app/api/friends/requests/route";
import { PATCH as respondRequest, DELETE as cancelRequest } from "@/app/api/friends/requests/[requestId]/route";
import { GET as searchUsers } from "@/app/api/friends/search/route";

describe("Friends & Controlled Discovery API Routes", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  describe("GET /api/friends", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const res = await getFriends();
      expect(res.status).toBe(401);
    });

    it("returns friends list when authenticated", async () => {
      const mockFriends = [
        { id: "u-2", username: "alice", displayName: "Alice", avatarUrl: null },
      ];
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: {
          rpc: vi.fn().mockResolvedValue({ data: mockFriends, error: null }),
        },
      });

      const res = await getFriends();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.friends).toHaveLength(1);
      expect(body.friends[0].username).toBe("alice");
    });
  });

  describe("DELETE /api/friends/[friendId]", () => {
    it("removes friend when valid UUID provided", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { status: "removed" }, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const res = await deleteFriend(new Request("http://localhost"), {
        params: Promise.resolve({ friendId: "11111111-1111-4111-8111-111111111111" }),
      });

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("remove_friend", {
        p_friend_id: "11111111-1111-4111-8111-111111111111",
      });
    });
  });

  describe("Friend Requests Lifecycle", () => {
    it("lists friend requests", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          incoming: [{ id: "req-1", sender_id: "u-2", recipient_id: "u-1", status: "pending" }],
          outgoing: [],
        },
        error: null,
      });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const res = await getRequests();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.incoming).toHaveLength(1);
    });

    it("sends friend request successfully", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { status: "sent", id: "req-1" }, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientId: "22222222-2222-4222-8222-222222222222" }),
      });

      const res = await sendRequest(req);
      expect(res.status).toBe(201);
      expect(mockRpc).toHaveBeenCalledWith("send_friend_request", {
        p_recipient_id: "22222222-2222-4222-8222-222222222222",
      });
    });

    it("accepts incoming friend request", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { status: "accepted" }, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });

      const res = await respondRequest(req, {
        params: Promise.resolve({ requestId: "33333333-3333-4333-8333-333333333333" }),
      });

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("respond_friend_request", {
        p_request_id: "33333333-3333-4333-8333-333333333333",
        p_action: "accept",
      });
    });

    it("cancels outgoing request", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { status: "cancelled" }, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const res = await cancelRequest(new Request("http://localhost"), {
        params: Promise.resolve({ requestId: "33333333-3333-4333-8333-333333333333" }),
      });

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("cancel_friend_request", {
        p_request_id: "33333333-3333-4333-8333-333333333333",
      });
    });
  });

  describe("GET /api/friends/search", () => {
    it("returns empty results for query less than 2 characters", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-1", supabase: {} });
      const req = new Request("http://localhost/api/friends/search?q=a");
      const res = await searchUsers(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toEqual([]);
    });

    it("executes user search without exposing emails", async () => {
      const mockUsers = [
        {
          id: "u-2",
          username: "alice",
          displayName: "Alice Student",
          avatarUrl: null,
          friendshipStatus: "none",
        },
      ];
      const mockRpc = vi.fn().mockResolvedValue({ data: mockUsers, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/friends/search?q=alice");
      const res = await searchUsers(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0].username).toBe("alice");
      expect(body.results[0].email).toBeUndefined();
    });
  });
});
