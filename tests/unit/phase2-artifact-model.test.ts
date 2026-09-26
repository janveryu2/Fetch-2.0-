import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
  unauthorizedResponse: () =>
    Response.json({ error: "Sign in to use account features.", code: "AUTH_REQUIRED" }, { status: 401 }),
}));

import { GET as getArtifacts } from "@/app/api/artifacts/route";
import { persistStudyPackServer } from "@/lib/server/privileged-supabase";
import type { Question } from "@/lib/demo-types";

const VALID_USER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PACK_ID = "22222222-2222-4222-8222-222222222222";
const VALID_ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";

const sampleQuestions: Question[] = [
  {
    id: "q-1",
    type: "multiple_choice",
    prompt: "What is the powerhouse of the cell?",
    answer: "Mitochondria",
    choices: ["Nucleus", "Ribosome", "Mitochondria", "Golgi"],
    explanation: "Mitochondria generate most of the chemical energy needed to power the cell.",
  },
  {
    id: "q-2",
    type: "fill_blank",
    prompt: "The control center of the cell is the _____.",
    answer: "nucleus",
    explanation: "The nucleus houses the cell DNA.",
  },
  {
    id: "q-3",
    type: "multiple_choice",
    prompt: "Which organelle synthesizes proteins?",
    answer: "Ribosome",
    choices: ["Ribosome", "Lysosome", "Vacuole", "Centrosome"],
    explanation: "Ribosomes translate mRNA into polypeptide chains.",
  },
];

describe("Phase 2 - Artifact Model & Creation Choice", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  describe("GET /api/artifacts (List Study Artifacts)", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const res = await getArtifacts(new Request("http://localhost/api/artifacts"));
      expect(res.status).toBe(401);
    });

    it("returns artifact list for authenticated user", async () => {
      const mockArtifacts = [
        {
          id: VALID_ARTIFACT_ID,
          packId: VALID_PACK_ID,
          ownerId: VALID_USER_ID,
          kind: "quiz",
          origin: "generated",
          status: "ready",
          title: "Biology 101",
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: {
          rpc: vi.fn().mockResolvedValue({ data: mockArtifacts, error: null }),
        },
      });

      const res = await getArtifacts(new Request("http://localhost/api/artifacts"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.artifacts).toHaveLength(1);
      expect(json.artifacts[0].kind).toBe("quiz");
      expect(json.artifacts[0].id).toBe(VALID_ARTIFACT_ID);
    });

    it("filters artifacts by packId query parameter when supplied", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
      mockGetAuth.mockResolvedValue({
        userId: VALID_USER_ID,
        supabase: { rpc: mockRpc },
      });

      const res = await getArtifacts(new Request(`http://localhost/api/artifacts?packId=${VALID_PACK_ID}`));
      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("list_study_artifacts", {
        p_pack_id: VALID_PACK_ID,
      });
    });
  });

  describe("StudyPack Persistence with Artifact Identity", () => {
    it("returns both packId and artifactId from persistStudyPackServer", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: VALID_PACK_ID,
          packId: VALID_PACK_ID,
          artifactId: VALID_ARTIFACT_ID,
          questions: sampleQuestions,
        },
        error: null,
      });

      const fakeClient = { rpc: mockRpc } as unknown as Parameters<typeof persistStudyPackServer>[0]["fallbackClient"];

      const result = await persistStudyPackServer({
        ownerId: VALID_USER_ID,
        title: "Cell Biology",
        sourceType: "text",
        sourceLabel: "Notes",
        sourceContent: "Detailed biological notes on cellular structures and function across all kingdoms of life.",
        contentHash: "a".repeat(64),
        questions: sampleQuestions,
        fallbackClient: fakeClient,
      });

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(VALID_PACK_ID);
      expect(result.data?.packId).toBe(VALID_PACK_ID);
      expect(result.data?.artifactId).toBe(VALID_ARTIFACT_ID);
      expect(result.data?.questions).toHaveLength(3);
    });
  });
});
