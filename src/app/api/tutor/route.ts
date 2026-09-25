import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { GroqTutorProvider, type TutorChatMessage } from "@/lib/ai/groq-tutor";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  packId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const conversationId = new URL(request.url).searchParams.get("conversationId");
  if (conversationId) {
    if (!z.string().uuid().safeParse(conversationId).success) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    const { data, error } = await context.supabase.rpc("read_tutor_conversation", {
      p_conversation_id: conversationId,
    });
    if (error) return Response.json({ error: "Conversation could not be loaded." }, { status: 404 });
    return Response.json({ messages: data });
  }
  const { data, error } = await context.supabase.rpc("list_tutor_conversations");
  if (error) return Response.json({ error: "Tutor history could not be loaded." }, { status: 503 });
  return Response.json({ conversations: data });
}

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const tutor = new GroqTutorProvider();
  if (!tutor.isConfigured()) {
    return Response.json(
      { error: "AI Tutor is not configured. Add GROQ_API_KEY." },
      { status: 503 }
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a question up to 4,000 characters." }, { status: 400 });
  }

  const { supabase, userId } = context;
  const packId = parsed.data.packId ?? null;

  if (packId) {
    const { data: pack, error } = await supabase
      .from("study_packs")
      .select("id")
      .eq("id", packId)
      .eq("owner_id", userId)
      .eq("status", "ready")
      .maybeSingle();
    if (error) return Response.json({ error: "StudyPack access could not be checked." }, { status: 503 });
    if (!pack) return Response.json({ error: "Choose one of your own StudyPacks." }, { status: 404 });
  }

  const { data: allowed, error: quotaError } = await supabase.rpc("consume_tutor_quota");
  if (quotaError) {
    return Response.json(
      { error: "Tutor storage is not ready. Apply the account database schema and try again." },
      { status: 503 }
    );
  }
  if (allowed !== true) {
    return Response.json({ error: "Tutor limit reached. Try again in a few minutes." }, { status: 429 });
  }

  let source = "";
  if (packId) {
    const { data, error } = await supabase.rpc("get_owned_study_source", { p_pack_id: packId });
    if (error || typeof data !== "string") {
      return Response.json({ error: "StudyPack material could not be loaded." }, { status: 404 });
    }
    source = data.slice(0, 12000);
  }

  let history: TutorChatMessage[] = [];
  if (parsed.data.conversationId) {
    const { data, error } = await supabase.rpc("read_tutor_conversation", {
      p_conversation_id: parsed.data.conversationId,
    });
    if (error || !Array.isArray(data)) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    history = data.filter(
      (item): item is TutorChatMessage =>
        typeof item === "object" &&
        item !== null &&
        ((item as TutorChatMessage).role === "user" ||
          (item as TutorChatMessage).role === "assistant") &&
        typeof (item as TutorChatMessage).content === "string"
    );
  }

  let streamIterable: AsyncIterable<string>;
  try {
    streamIterable = tutor.streamReply({
      message: parsed.data.message,
      source,
      history,
      signal: request.signal,
    });
  } catch (error) {
    console.error("Tutor stream could not start", error instanceof Error ? error.name : "unknown error");
    return Response.json(
      { error: "FETCH could not get a tutor reply. Please try again." },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (controller.desiredSize !== null) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      };

      void (async () => {
        let reply = "";
        try {
          for await (const chunk of streamIterable) {
            if (reply.length + chunk.length > 8000) {
              throw new Error("Tutor reply exceeded the saved message limit.");
            }
            reply += chunk;
            send({ type: "delta", delta: chunk });
          }

          reply = reply.trim();
          if (!reply) throw new Error("Tutor did not return a usable reply.");

          const { data: conversationId, error: saveError } = await supabase.rpc("save_tutor_exchange", {
            p_conversation_id: parsed.data.conversationId ?? null,
            p_pack_id: packId,
            p_user_content: parsed.data.message,
            p_assistant_content: reply,
          });

          if (saveError || typeof conversationId !== "string") {
            send({ type: "error", error: "FETCH received a reply but could not save the conversation." });
          } else {
            send({ type: "done", conversationId });
          }
        } catch (error) {
          console.error("Tutor stream failed", error instanceof Error ? error.message : "unknown error");
          send({ type: "error", error: "FETCH could not finish the tutor reply. Please try again." });
        } finally {
          if (controller.desiredSize !== null) controller.close();
        }
      })();
    },
  });

  return new Response(sse, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
