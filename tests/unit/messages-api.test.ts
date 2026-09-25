import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Sign in to use account features.", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { GET as getConversations, POST as createConversation } from "@/app/api/conversations/route";
import {
  GET as getMessages,
  POST as sendMessage,
} from "@/app/api/conversations/[conversationId]/messages/route";

const VALID_USER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PARTICIPANT_ID = "22222222-2222-4222-8222-222222222222";
const VALID_CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";

describe("Direct Messages & Realtime API", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  describe("GET /api/conversations", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const res = await getConversations();
      expect(res.status).toBe(401);
    });

    it("returns conversation list when authenticated", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: VALID_CONVERSATION_ID,
            updatedAt: "2026-09-25T12:00:00Z",
            participant: {
              id: VALID_PARTICIPANT_ID,
              username: "buddy",
              displayName: "Study Buddy",
              avatarUrl: null,
            },
            lastMessage: {
              id: "msg-1",
              body: "Ready to study?",
              createdAt: "2026-09-25T12:00:00Z",
              mine: false,
            },
          },
        ],
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getConversations();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.conversations).toHaveLength(1);
      expect(json.conversations[0].id).toBe(VALID_CONVERSATION_ID);
      expect(mockRpc).toHaveBeenCalledWith("list_user_conversations");
    });
  });

  describe("POST /api/conversations", () => {
    it("rejects conversation with self", async () => {
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: vi.fn() },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: VALID_USER_ID }),
      });

      const res = await createConversation(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Cannot start a conversation with yourself/);
    });

    it("creates or retrieves direct conversation with a friend", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: VALID_CONVERSATION_ID,
          participant: {
            id: VALID_PARTICIPANT_ID,
            username: "buddy",
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

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: VALID_PARTICIPANT_ID }),
      });

      const res = await createConversation(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.conversation.id).toBe(VALID_CONVERSATION_ID);
      expect(mockRpc).toHaveBeenCalledWith("get_or_create_direct_conversation", {
        p_participant_id: VALID_PARTICIPANT_ID,
      });
    });
  });

  describe("GET /api/conversations/[conversationId]/messages", () => {
    it("returns 400 for invalid conversation ID", async () => {
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: vi.fn() },
      });

      const res = await getMessages(new Request("http://localhost"), {
        params: Promise.resolve({ conversationId: "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns messages for authorized member with limit and pagination", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: "m-1",
            conversationId: VALID_CONVERSATION_ID,
            senderId: VALID_PARTICIPANT_ID,
            body: "Hello!",
            createdAt: "2026-09-25T11:00:00Z",
            mine: false,
          },
          {
            id: "m-2",
            conversationId: VALID_CONVERSATION_ID,
            senderId: VALID_USER_ID,
            body: "Hi there!",
            createdAt: "2026-09-25T11:05:00Z",
            mine: true,
          },
        ],
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getMessages(
        new Request(`http://localhost/api/conversations/${VALID_CONVERSATION_ID}/messages?limit=25`),
        { params: Promise.resolve({ conversationId: VALID_CONVERSATION_ID }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.messages).toHaveLength(2);
      expect(mockRpc).toHaveBeenCalledWith("list_direct_messages", {
        p_conversation_id: VALID_CONVERSATION_ID,
        p_limit: 25,
        p_before: null,
      });
    });

    it("returns 403 when user is not a conversation member", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Not authorized to read messages from this conversation." },
      });

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getMessages(
        new Request(`http://localhost/api/conversations/${VALID_CONVERSATION_ID}/messages`),
        { params: Promise.resolve({ conversationId: VALID_CONVERSATION_ID }) }
      );

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/conversations/[conversationId]/messages", () => {
    it("validates message body is not empty", async () => {
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: vi.fn() },
      });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "   " }),
      });

      const res = await sendMessage(req, {
        params: Promise.resolve({ conversationId: VALID_CONVERSATION_ID }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Message cannot be empty/);
    });

    it("sends message with clientMessageId idempotency", async () => {
      const clientMsgId = "client-uuid-999";
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: "m-new",
          conversationId: VALID_CONVERSATION_ID,
          senderId: VALID_USER_ID,
          body: "Let's study chapter 3!",
          createdAt: "2026-09-25T12:30:00Z",
          clientMessageId: clientMsgId,
          mine: true,
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
          body: "Let's study chapter 3!",
          clientMessageId: clientMsgId,
        }),
      });

      const res = await sendMessage(req, {
        params: Promise.resolve({ conversationId: VALID_CONVERSATION_ID }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message.id).toBe("m-new");
      expect(json.message.clientMessageId).toBe(clientMsgId);
      expect(mockRpc).toHaveBeenCalledWith("send_direct_message", {
        p_conversation_id: VALID_CONVERSATION_ID,
        p_body: "Let's study chapter 3!",
        p_client_message_id: clientMsgId,
      });
    });
  });
});
