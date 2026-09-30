import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Sign in to use account features.", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { POST as createRoom, GET as getLiveHome } from "@/app/api/live/rooms/route";
import { POST as joinRoom } from "@/app/api/live/rooms/join/route";
import { GET as getRoomState } from "@/app/api/live/rooms/[roomId]/route";
import { POST as handleRoomAction } from "@/app/api/live/rooms/[roomId]/action/route";

const VALID_USER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PACK_ID = "22222222-2222-4222-8222-222222222222";
const VALID_ROOM_ID = "33333333-3333-4333-8333-333333333333";

describe("Live Competition API Routes", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  it("loads authenticated real directory data without caching", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { rooms: [], leaderboard: [] }, error: null });
    mockGetAuth.mockResolvedValue({ userId: VALID_USER_ID, supabase: { rpc } });
    const response = await getLiveHome(new Request("http://localhost/api/live/rooms?period=today"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("get_live_home", { p_period: "today" });
  });

  it("passes privacy/capacity to server and rejects unsupported limits", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { roomId: VALID_ROOM_ID }, error: null });
    mockGetAuth.mockResolvedValue({ userId: VALID_USER_ID, supabase: { rpc } });
    const request = (maxPlayers: number) => new Request("http://localhost/api/live/rooms", { method: "POST", body: JSON.stringify({ packId: VALID_PACK_ID, visibility: "public", maxPlayers }) });
    expect((await createRoom(request(6))).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_live_room_configured", { p_pack_id: VALID_PACK_ID, p_artifact_id: null, p_visibility: "public", p_max_players: 6 });
    expect((await createRoom(request(8))).status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("joins public rooms by ID through the guarded RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { roomId: VALID_ROOM_ID }, error: null });
    mockGetAuth.mockResolvedValue({ userId: VALID_USER_ID, supabase: { rpc } });
    const response = await joinRoom(new Request("http://localhost/api/live/rooms/join", { method: "POST", body: JSON.stringify({ roomId: VALID_ROOM_ID }) }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("join_public_live_room", { p_room_id: VALID_ROOM_ID });
  });

  it("leaves through the server instead of clearing only client state", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { left: true }, error: null });
    mockGetAuth.mockResolvedValue({ userId: VALID_USER_ID, supabase: { rpc } });
    const response = await handleRoomAction(new Request("http://localhost", { method: "POST", body: JSON.stringify({ action: "leave" }) }), { params: Promise.resolve({ roomId: VALID_ROOM_ID }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("leave_live_room", { p_room_id: VALID_ROOM_ID });
  });

  describe("POST /api/live/rooms (Create Room)", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const res = await createRoom(new Request("http://localhost"));
      expect(res.status).toBe(401);
    });

    it("creates room with valid pack ID", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          roomId: VALID_ROOM_ID,
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

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: VALID_PACK_ID }),
      });

      const res = await createRoom(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.joinCode).toBe("ABC789");
      expect(mockRpc).toHaveBeenCalledWith("create_live_room_configured", {
        p_pack_id: VALID_PACK_ID,
        p_artifact_id: null,
        p_visibility: "private",
        p_max_players: 4,
      });
    });
  });

  describe("POST /api/live/rooms/join (Join Room)", () => {
    it("joins room with valid 6-char code", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { roomId: VALID_ROOM_ID, status: "lobby", packId: VALID_PACK_ID },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: "ABC789" }),
      });

      const res = await joinRoom(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.roomId).toBe(VALID_ROOM_ID);
      expect(mockRpc).toHaveBeenCalledWith("join_live_room", {
        p_join_code: "ABC789",
      });
    });

    it("rejects code with incorrect length", async () => {
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: vi.fn() },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: "ABC" }),
      });

      const res = await joinRoom(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/live/rooms/[roomId] (Room State)", () => {
    it("returns room state for member", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          roomId: VALID_ROOM_ID,
          status: "active",
          isHost: true,
          members: [{ userId: VALID_USER_ID, score: 200, displayName: "Host" }],
          currentQuestion: { index: 0, prompt: "What is 2+2?", options: ["3", "4", "5"] },
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getRoomState(new Request("http://localhost"), {
        params: Promise.resolve({ roomId: VALID_ROOM_ID }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("active");
      expect(mockRpc).toHaveBeenCalledWith("get_live_room_state", {
        p_room_id: VALID_ROOM_ID,
      });
    });

    it("returns 403 when access is denied", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Access denied: not a member of this room." },
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getRoomState(new Request("http://localhost"), {
        params: Promise.resolve({ roomId: VALID_ROOM_ID }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/live/rooms/[roomId]/action", () => {
    it("handles start action", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, status: "active" },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const res = await handleRoomAction(req, {
        params: Promise.resolve({ roomId: VALID_ROOM_ID }),
      });

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("start_live_game", {
        p_room_id: VALID_ROOM_ID,
      });
    });

    it("handles submit_answer with server authoritative scoring", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          isCorrect: true,
          correctIndex: 1,
          pointsAwarded: 100,
          currentScore: 100,
          explanation: "4 is the sum.",
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          questionIndex: 0,
          selectedIndex: 1,
        }),
      });

      const res = await handleRoomAction(req, {
        params: Promise.resolve({ roomId: VALID_ROOM_ID }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isCorrect).toBe(true);
      expect(json.pointsAwarded).toBe(100);
      expect(mockRpc).toHaveBeenCalledWith("submit_live_answer", {
        p_room_id: VALID_ROOM_ID,
        p_question_index: 0,
        p_selected_index: 1,
      });
    });
  });
});
