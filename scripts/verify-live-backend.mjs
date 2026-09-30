// Run explicitly: node --env-file=.env.local scripts/verify-live-backend.mjs
// Uses isolated temporary accounts and removes only its own records in finally.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && key && adminKey, "Supabase environment is required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, adminKey, options);
const users = [];
const rooms = [];
let packId;
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? ""} ${result.error.message}`);
  return result.data;
}
async function account(label) {
  const email = `fetch-verification-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa!9`;
  const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `FETCH verification ${label}` } }), `create ${label}`);
  users.push(data.user.id);
  const client = createClient(url, key, options);
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return client;
}
try {
  const schemaResponse = await fetch(`${url}/rest/v1/`, { headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` } });
  const schema = await schemaResponse.json();
  console.log("Live schema columns:", Object.keys(schema.definitions?.live_rooms?.properties ?? {}).join(", "));
  const host = await account("host");
  const guest = await account("guest");
  const other = await account("capacity check");
  const source = "The nucleus stores genetic instructions. Mitochondria provide energy. Chloroplasts carry out photosynthesis in plant cells.";
  const fixture = checked(await admin.rpc("create_study_pack", {
    p_title: "FETCH isolated Live verification", p_source_type: "text", p_source_label: "Verification fixture",
    p_source_content: source, p_content_hash: createHash("sha256").update(source).digest("hex"), p_owner_id: users[0],
    p_questions: ["Nucleus", "Mitochondria", "Chloroplasts"].map((answer, i) => ({
      kind: "multiple_choice", prompt: `Choose organelle ${i + 1}: ${answer}`, choices: [answer, "Other"], answer, explanation: "Verification", sourceQuote: source,
    })),
  }), "create fixture pack");
  packId = fixture.id;
  assert(packId);
  const legacy = await host.rpc("create_live_room", { p_pack_id: packId });
  if (legacy.data?.roomId) rooms.push(legacy.data.roomId);
  console.log("One-argument create:", legacy.error ? `${legacy.error.code} ${legacy.error.message}` : "OK");
  const privateRoom = checked(await host.rpc("create_live_room_configured", { p_pack_id: packId, p_visibility: "private", p_max_players: 2 }), "private room");
  rooms.push(privateRoom.roomId);
  let home = checked(await guest.rpc("get_live_home", { p_period: "today" }), "private directory");
  assert(!home.rooms.some(room => room.roomId === privateRoom.roomId));
  assert((await guest.rpc("join_public_live_room", { p_room_id: privateRoom.roomId })).error);
  assert((await guest.rpc("get_live_room_state", { p_room_id: privateRoom.roomId })).error);
  checked(await guest.rpc("join_live_room", { p_join_code: privateRoom.joinCode }), "private invitation");
  assert((await other.rpc("join_live_room", { p_join_code: privateRoom.joinCode })).error);
  checked(await guest.rpc("leave_live_room", { p_room_id: privateRoom.roomId }), "guest leaves");
  checked(await other.rpc("join_live_room", { p_join_code: privateRoom.joinCode }), "vacant seat");
  checked(await host.rpc("leave_live_room", { p_room_id: privateRoom.roomId }), "host ends room");
  assert((await guest.rpc("join_live_room", { p_join_code: privateRoom.joinCode })).error);
  const raceRoom = checked(await host.rpc("create_live_room_configured", { p_pack_id: packId, p_visibility: "public", p_max_players: 2 }), "capacity race room");
  rooms.push(raceRoom.roomId);
  const racers = await Promise.all([guest, other].map(client => client.rpc("join_public_live_room", { p_room_id: raceRoom.roomId })));
  assert.equal(racers.filter(result => !result.error).length, 1, "only one concurrent guest can take the last seat");
  const raceState = checked(await host.rpc("get_live_room_state", { p_room_id: raceRoom.roomId }), "capacity state");
  assert.equal(raceState.members.length, 2);
  checked(await host.rpc("leave_live_room", { p_room_id: raceRoom.roomId }), "close race room");
  const room = checked(await host.rpc("create_live_room_configured", { p_pack_id: packId, p_artifact_id: null, p_visibility: "public", p_max_players: 4 }), "public create");
  rooms.push(room.roomId);
  assert.equal(room.status, "lobby");
  assert.match(room.joinCode, /^[A-Z0-9]{6}$/);
  let state = checked(await host.rpc("get_live_room_state", { p_room_id: room.roomId }), "host state");
  assert(state.members.some(member => member.isHost && member.userId === users[0]));
  home = checked(await guest.rpc("get_live_home", { p_period: "week" }), "public directory");
  assert(home.rooms.some(item => item.roomId === room.roomId && item.maxPlayers === 4));
  assert(!JSON.stringify(home).includes(room.joinCode), "directory must not expose invitation codes");
  checked(await guest.rpc("join_public_live_room", { p_room_id: room.roomId }), "public guest joins");
  state = checked(await guest.rpc("get_live_room_state", { p_room_id: room.roomId }), "guest state");
  assert.equal(state.members.length, 2);
  checked(await host.rpc("start_live_game", { p_room_id: room.roomId }), "start");
  for (let index = 0; index < 3; index++) {
    state = checked(await guest.rpc("get_live_room_state", { p_room_id: room.roomId }), "question state");
    assert.equal(state.currentQuestion.index, index);
    assert.equal(state.currentQuestion.correctIndex, null);
    for (const client of [host, guest]) checked(await client.rpc("submit_live_answer", { p_room_id: room.roomId, p_question_index: index, p_selected_index: 0 }), "answer");
    checked(await host.rpc("advance_live_question", { p_room_id: room.roomId }), "advance");
  }
  state = checked(await host.rpc("get_live_room_state", { p_room_id: room.roomId }), "final state");
  assert.equal(state.status, "complete");
  assert(state.members.every(member => member.score > 0));
  home = checked(await guest.rpc("get_live_home", { p_period: "today" }), "leaderboard");
  assert(home.leaderboard.some(entry => entry.userId === users[0] && entry.score > 0));
  assert(!home.rooms.some(item => item.roomId === room.roomId));
  console.log("PASS: real host/membership, public and private joining, directory privacy, capacity races, leaving, start, private answer keys, scoring, completion and real leaderboard");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const id of rooms) checked(await admin.from("live_rooms").delete().eq("id", id), "remove test room");
  if (packId) checked(await admin.from("study_packs").delete().eq("id", packId), "remove test pack");
  for (const id of users) checked(await admin.auth.admin.deleteUser(id), "remove test account");
  console.log("Verification fixtures cleaned up");
}
