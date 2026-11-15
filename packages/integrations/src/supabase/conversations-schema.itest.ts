/**
 * Tier 2 - conversations and messages: state guard, phone and customer linking,
 * ingest_inbound_message, the summary triggers, and append-only messages.
 *
 * The state machine exists twice (CONVERSATION_TRANSITION_EDGES in TypeScript,
 * a hard-coded list in the SQL trigger). One test tries every state pair against
 * the database and diffs the result with the TypeScript export.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import {
  CONVERSATION_TRANSITION_EDGES,
  conversationStateValues,
  messageDirectionValues,
  messageSenderValues,
  messageStatusValues,
} from "@pakcommerce/shared/conversations";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connect,
  createSeller,
  type Seller,
  withRollback,
} from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

async function enumValues(name: string): Promise<string[]> {
  const { rows } = await client.query<{ value: string }>(
    `select e.enumlabel as value
     from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = $1 order by e.enumsortorder`,
    [name],
  );
  return rows.map((row) => row.value);
}

async function insertConversation(
  seller: Seller,
  overrides: { phone?: string; state?: string; name?: string | null } = {},
): Promise<string> {
  const {
    rows: [row],
  } = await client.query<{ id: string }>(
    `insert into public.conversations
       (workspace_id, seller_id, buyer_phone, buyer_name, state)
     values ($1, $2, $3, $4, $5::public.conversation_state) returning id`,
    [
      seller.workspaceId,
      seller.sellerId,
      overrides.phone ?? "0300 1234567",
      overrides.name ?? null,
      overrides.state ?? "open",
    ],
  );
  return row.id;
}

async function conversation(id: string) {
  const {
    rows: [row],
  } = await client.query(`select * from public.conversations where id = $1`, [
    id,
  ]);
  return row;
}

interface IngestResult {
  conversation_id: string;
  message_id: string;
  duplicate: boolean;
  state: string;
}

async function ingest(
  seller: Seller,
  args: {
    phone?: string;
    name?: string | null;
    sid?: string | null;
    body?: string | null;
    media?: unknown[] | null;
    ai?: boolean;
  } = {},
): Promise<IngestResult> {
  const {
    rows: [row],
  } = await client.query<IngestResult>(
    `select * from public.ingest_inbound_message($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      seller.workspaceId,
      args.phone ?? "0300 1234567",
      args.name === undefined ? null : args.name,
      args.sid === undefined ? null : args.sid,
      args.body === undefined ? "hello" : args.body,
      JSON.stringify(args.media ?? []),
      args.ai ?? false,
    ],
  );
  return row;
}

async function insertMessage(
  seller: Seller,
  conversationId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const {
    rows: [row],
  } = await client.query<{ id: string }>(
    `insert into public.messages
       (workspace_id, seller_id, conversation_id, direction, sender, body, media, status)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) returning id`,
    [
      seller.workspaceId,
      seller.sellerId,
      conversationId,
      overrides.direction ?? "outbound",
      overrides.sender ?? "seller",
      overrides.body === undefined ? "hi" : overrides.body,
      JSON.stringify(overrides.media ?? []),
      overrides.status ?? "queued",
    ],
  );
  return row.id;
}

async function insertCustomer(seller: Seller, phone: string): Promise<string> {
  const {
    rows: [row],
  } = await client.query<{ id: string }>(
    `insert into public.customers (workspace_id, seller_id, name, phone, city)
     values ($1, $2, 'Ayesha', $3, 'Lahore') returning id`,
    [seller.workspaceId, seller.sellerId, phone],
  );
  return row.id;
}

/** Runs `body` expecting it to throw, then rolls the failed statement back. */
async function rejection(body: () => Promise<unknown>): Promise<Error> {
  await client.query("savepoint expect_fail");
  try {
    await body();
  } catch (error) {
    await client.query("rollback to savepoint expect_fail");
    return error as Error;
  }
  throw new Error("expected the statement to be rejected");
}

describe("enums match the shared contract", () => {
  it.each([
    ["conversation_state", conversationStateValues],
    ["message_direction", messageDirectionValues],
    ["message_sender", messageSenderValues],
    ["message_status", messageStatusValues],
  ] as const)("%s", async (name, expected) => {
    expect(await enumValues(name)).toEqual([...expected]);
  });
});

describe("conversation state guard", () => {
  it("allows exactly CONVERSATION_TRANSITION_EDGES and nothing else", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-edges");
      const allowed: string[] = [];
      let n = 0;

      for (const from of conversationStateValues) {
        for (const to of conversationStateValues) {
          if (from === to) continue;
          n += 1;
          const id = await insertConversation(seller, {
            phone: `+92300${String(1000000 + n)}`,
            state: from,
          });
          await client.query("savepoint pair");
          try {
            await client.query(
              `update public.conversations set state = $2::public.conversation_state where id = $1`,
              [id, to],
            );
            allowed.push(`${from}>${to}`);
          } catch {
            await client.query("rollback to savepoint pair");
          }
        }
      }

      const expected = CONVERSATION_TRANSITION_EDGES.map(
        ([f, t]) => `${f}>${t}`,
      );
      expect(allowed.sort()).toEqual([...expected].sort());
    });
  });

  it("a same-state update is not an error and does not touch state_changed_at", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-same");
      const id = await insertConversation(seller, { state: "closed" });
      await client.query(
        `update public.conversations set state_changed_at = '2020-01-01' where id = $1`,
        [id],
      );
      await client.query(
        `update public.conversations set state = 'closed' where id = $1`,
        [id],
      );
      const row = await conversation(id);
      expect(row.state).toBe("closed");
      expect(new Date(row.state_changed_at).getFullYear()).toBe(2020);
    });
  });

  it("stamps state_changed_at when the state changes", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-stamp");
      const id = await insertConversation(seller);
      await client.query(
        `update public.conversations set state_changed_at = '2020-01-01' where id = $1`,
        [id],
      );
      await client.query(
        `update public.conversations set state = 'ai_active' where id = $1`,
        [id],
      );
      const row = await conversation(id);
      expect(new Date(row.state_changed_at).getFullYear()).toBeGreaterThan(
        2020,
      );
    });
  });

  it("clears handoff_reason when leaving human_takeover, keeps it inside", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-handoff");
      const id = await insertConversation(seller, { state: "ai_active" });
      await client.query(
        `update public.conversations
         set state = 'human_takeover', handoff_reason = 'buyer asked for a person'
         where id = $1`,
        [id],
      );
      expect((await conversation(id)).handoff_reason).toBe(
        "buyer asked for a person",
      );

      await client.query(
        `update public.conversations set unread_count = 3 where id = $1`,
        [id],
      );
      expect((await conversation(id)).handoff_reason).toBe(
        "buyer asked for a person",
      );

      await client.query(
        `update public.conversations set state = 'ai_active' where id = $1`,
        [id],
      );
      expect((await conversation(id)).handoff_reason).toBeNull();
    });
  });

  it("does not keep a handoff_reason outside human_takeover", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-handoff2");
      const id = await insertConversation(seller);
      await client.query(
        `update public.conversations set handoff_reason = 'x' where id = $1`,
        [id],
      );
      expect((await conversation(id)).handoff_reason).toBeNull();
    });
  });

  it("workspace_id, seller_id, channel and buyer_phone cannot be changed", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-imm");
      const other = await createSeller(client, "conv-imm-other");
      const id = await insertConversation(seller);

      const edits: [string, unknown][] = [
        ["workspace_id", other.workspaceId],
        ["seller_id", other.sellerId],
        ["channel", "sms"],
        ["buyer_phone", "+923009999999"],
      ];
      for (const [column, value] of edits) {
        const error = await rejection(() =>
          client.query(
            `update public.conversations set ${column} = $2 where id = $1`,
            [id, value],
          ),
        );
        expect(error.message, column).toMatch(/cannot be changed/);
      }
    });
  });
});

describe("conversation constraints", () => {
  it("normalises the buyer phone", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-phone");
      const id = await insertConversation(seller, { phone: "0300-123 4567" });
      expect((await conversation(id)).buyer_phone).toBe("+923001234567");
    });
  });

  it("refuses a phone without digits", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-blank");
      for (const phone of ["", "   ", "abc", "---"]) {
        const error = await rejection(() =>
          insertConversation(seller, { phone }),
        );
        expect(error.message, phone).toMatch(/buyer phone must contain digits/);
      }
    });
  });

  it("one thread per buyer, however the phone is written", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-unique");
      await insertConversation(seller, { phone: "03001234567" });
      await expect(
        insertConversation(seller, { phone: "+92 300 1234567" }),
      ).rejects.toThrow(/conversations_workspace_channel_phone_key/);
    });
  });

  it("refuses an unknown channel", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-channel");
      await expect(
        client.query(
          `insert into public.conversations (workspace_id, seller_id, channel, buyer_phone)
           values ($1, $2, 'sms', '+923001234567')`,
          [seller.workspaceId, seller.sellerId],
        ),
      ).rejects.toThrow(/conversations_channel_valid/);
    });
  });

  it("refuses a negative unread count and an over-long buyer name", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "conv-limits");
      const id = await insertConversation(seller);
      const negative = await rejection(() =>
        client.query(
          `update public.conversations set unread_count = -1 where id = $1`,
          [id],
        ),
      );
      expect(negative.message).toMatch(
        /conversations_unread_count_nonnegative/,
      );
      await expect(
        insertConversation(seller, {
          phone: "+923001111111",
          name: "x".repeat(201),
        }),
      ).rejects.toThrow(/conversations_buyer_name_max_length/);
    });
  });
});

describe("customer linking", () => {
  it("links an existing customer when the conversation is created", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "link-existing");
      const customerId = await insertCustomer(seller, "+923001234567");
      const id = await insertConversation(seller, { phone: "0300 1234567" });
      expect((await conversation(id)).customer_id).toBe(customerId);
    });
  });

  it("does not create a customer from a conversation", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "link-none");
      const id = await insertConversation(seller);
      expect((await conversation(id)).customer_id).toBeNull();
      const { rows } = await client.query(
        `select count(*)::int as n from public.customers where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  it("links a customer created after the conversation", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "link-later");
      const other = await createSeller(client, "link-later-other");
      const id = await insertConversation(seller);
      const otherId = await insertConversation(other);

      const customerId = await insertCustomer(seller, "+923001234567");
      expect((await conversation(id)).customer_id).toBe(customerId);
      // Another workspace with the same phone is not touched.
      expect((await conversation(otherId)).customer_id).toBeNull();
    });
  });

  it("clears customer_id (not workspace_id) when the customer is deleted", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "link-drop");
      const customerId = await insertCustomer(seller, "+923001234567");
      const id = await insertConversation(seller);
      await client.query(`delete from public.customers where id = $1`, [
        customerId,
      ]);
      const row = await conversation(id);
      expect(row.customer_id).toBeNull();
      expect(row.workspace_id).toBe(seller.workspaceId);
    });
  });
});

describe("ingest_inbound_message", () => {
  it("creates the conversation and the message", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-new");
      const result = await ingest(seller, {
        sid: "SM1",
        name: "Ayesha",
        body: "salaam",
      });
      expect(result.duplicate).toBe(false);
      expect(result.state).toBe("open");

      const row = await conversation(result.conversation_id);
      expect(row).toMatchObject({
        seller_id: seller.sellerId,
        buyer_phone: "+923001234567",
        buyer_name: "Ayesha",
        state: "open",
        unread_count: 1,
        last_message_preview: "salaam",
        last_message_sender: "buyer",
      });
      expect(row.last_message_at).not.toBeNull();

      const {
        rows: [message],
      } = await client.query(`select * from public.messages where id = $1`, [
        result.message_id,
      ]);
      expect(message).toMatchObject({
        direction: "inbound",
        sender: "buyer",
        status: "received",
        provider_message_id: "SM1",
        body: "salaam",
      });
    });
  });

  it("a second message uses the same thread and counts unread", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-two");
      const first = await ingest(seller, { sid: "SM1", name: "Ayesha" });
      const second = await ingest(seller, {
        sid: "SM2",
        phone: "+92 300 1234567",
        name: null,
      });
      expect(second.conversation_id).toBe(first.conversation_id);
      const row = await conversation(first.conversation_id);
      expect(row.unread_count).toBe(2);
      // A missing name does not erase the one we have.
      expect(row.buyer_name).toBe("Ayesha");

      await ingest(seller, { sid: "SM3", name: "Ayesha K" });
      expect((await conversation(first.conversation_id)).buyer_name).toBe(
        "Ayesha K",
      );
    });
  });

  it("a repeated MessageSid returns the first message and changes nothing", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-dup");
      const first = await ingest(seller, { sid: "SMdup", body: "one" });
      const again = await ingest(seller, { sid: "SMdup", body: "one" });
      expect(again).toEqual({ ...first, duplicate: true });

      const row = await conversation(first.conversation_id);
      expect(row.unread_count).toBe(1);
      const { rows } = await client.query(
        `select count(*)::int as n from public.messages where conversation_id = $1`,
        [first.conversation_id],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("the same MessageSid in another workspace is a different message", async () => {
    await withRollback(client, async () => {
      const a = await createSeller(client, "ing-ws-a");
      const b = await createSeller(client, "ing-ws-b");
      const first = await ingest(a, { sid: "SMsame" });
      const other = await ingest(b, { sid: "SMsame" });
      expect(other.duplicate).toBe(false);
      expect(other.conversation_id).not.toBe(first.conversation_id);
    });
  });

  it.each([
    [true, "ai_active"],
    [false, "open"],
  ])(
    "a closed conversation reopens (ai enabled = %s -> %s)",
    async (ai, expected) => {
      await withRollback(client, async () => {
        const seller = await createSeller(
          client,
          `ing-reopen-${expected.replace("_", "")}`,
        );
        const id = await insertConversation(seller, { state: "closed" });
        const result = await ingest(seller, { sid: "SMr", ai });
        expect(result.conversation_id).toBe(id);
        expect(result.state).toBe(expected);
        expect((await conversation(id)).state).toBe(expected);
      });
    },
  );

  it.each(["open", "ai_active", "waiting_approval", "human_takeover"])(
    "a live %s conversation keeps its state",
    async (state) => {
      await withRollback(client, async () => {
        const seller = await createSeller(
          client,
          `ing-live-${state.replace("_", "")}`,
        );
        const id = await insertConversation(seller, { state });
        const result = await ingest(seller, { sid: "SMl", ai: true });
        expect(result.state).toBe(state);
        expect((await conversation(id)).state).toBe(state);
      });
    },
  );

  it("media-only messages get a [media] preview; long bodies are cut at 160", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-preview");
      const media = [
        { url: "https://api.twilio.com/m/1", contentType: "image/jpeg" },
      ];
      const first = await ingest(seller, { sid: "SMm", body: null, media });
      expect(
        (await conversation(first.conversation_id)).last_message_preview,
      ).toBe("[media]");

      await ingest(seller, { sid: "SMlong", body: "a".repeat(500) });
      const row = await conversation(first.conversation_id);
      expect(row.last_message_preview).toBe("a".repeat(160));
    });
  });

  it("refuses an unknown workspace and a phone without digits", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-bad");
      const unknown = await rejection(() =>
        client.query(
          `select * from public.ingest_inbound_message(gen_random_uuid(), '0300 1234567', null, 'SMx', 'hi', '[]', false)`,
        ),
      );
      expect(unknown.message).toMatch(/workspace .* not found/);
      await expect(
        ingest(seller, { phone: "n/a", sid: "SMy" }),
      ).rejects.toThrow(/must contain digits/);
    });
  });

  it("refuses a message with neither body nor media, leaving no conversation behind", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "ing-empty");
      const error = await rejection(() =>
        ingest(seller, { sid: "SMe", body: "  ", media: [] }),
      );
      expect(error.message).toMatch(/messages_has_content/);
      const { rows } = await client.query(
        `select count(*)::int as n from public.conversations where workspace_id = $1`,
        [seller.workspaceId],
      );
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("message summary triggers", () => {
  it("an outbound message updates the preview but not unread_count", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "sum-out");
      const first = await ingest(seller, { sid: "SM1" });
      await insertMessage(seller, first.conversation_id, {
        body: "reply",
        sender: "ai",
      });
      const row = await conversation(first.conversation_id);
      expect(row.unread_count).toBe(1);
      expect(row.last_message_preview).toBe("reply");
      expect(row.last_message_sender).toBe("ai");
    });
  });
});

describe("message constraints", () => {
  it("inbound must be a buyer message with status received", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "msg-inbound");
      const id = await insertConversation(seller);
      for (const overrides of [
        { direction: "inbound", sender: "ai", status: "received" },
        { direction: "inbound", sender: "buyer", status: "sent" },
      ]) {
        const error = await rejection(() =>
          insertMessage(seller, id, overrides),
        );
        expect(error.message).toMatch(/messages_inbound_consistent/);
      }
    });
  });

  it("outbound cannot be from the buyer or already received", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "msg-outbound");
      const id = await insertConversation(seller);
      for (const overrides of [
        { sender: "buyer", status: "queued" },
        { sender: "seller", status: "received" },
      ]) {
        const error = await rejection(() =>
          insertMessage(seller, id, overrides),
        );
        expect(error.message).toMatch(/messages_outbound_consistent/);
      }
    });
  });

  it("needs a body or media, and limits size and media count", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "msg-content");
      const id = await insertConversation(seller);
      const media = { url: "https://x.test/a", contentType: "image/png" };
      const cases: [Record<string, unknown>, RegExp][] = [
        [{ body: null, media: [] }, /messages_has_content/],
        [{ body: "   ", media: [] }, /messages_has_content/],
        [{ body: "a".repeat(4097) }, /messages_body_max_length/],
        [
          { body: "hi", media: Array(11).fill(media) },
          /messages_media_is_array/,
        ],
      ];
      for (const [overrides, pattern] of cases) {
        const error = await rejection(() =>
          insertMessage(seller, id, overrides),
        );
        expect(error.message).toMatch(pattern);
      }
      await insertMessage(seller, id, { body: null, media: [media] });
      await insertMessage(seller, id, {
        body: "a".repeat(4096),
        media: Array(10).fill(media),
      });
    });
  });

  it("media must be a JSON array", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "msg-media");
      const id = await insertConversation(seller);
      await expect(
        client.query(
          `insert into public.messages
             (workspace_id, seller_id, conversation_id, direction, sender, body, media, status)
           values ($1, $2, $3, 'outbound', 'seller', 'hi', '{"a":1}'::jsonb, 'queued')`,
          [seller.workspaceId, seller.sellerId, id],
        ),
      ).rejects.toThrow(/messages_media_is_array/);
    });
  });

  it("a conversation from another workspace cannot be used", async () => {
    await withRollback(client, async () => {
      const a = await createSeller(client, "msg-ws-a");
      const b = await createSeller(client, "msg-ws-b");
      const convB = await insertConversation(b);
      await expect(insertMessage(a, convB)).rejects.toThrow(
        /messages_conversation_workspace_fkey/,
      );
    });
  });

  it("deleting the conversation deletes its messages", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "msg-cascade");
      const result = await ingest(seller, { sid: "SMc" });
      await client.query(`delete from public.conversations where id = $1`, [
        result.conversation_id,
      ]);
      const { rows } = await client.query(
        `select 1 from public.messages where id = $1`,
        [result.message_id],
      );
      expect(rows).toHaveLength(0);
    });
  });
});

describe("messages are append-only", () => {
  it("refuses changes to body and every other column, allows status", async () => {
    await withRollback(client, async () => {
      const seller = await createSeller(client, "append");
      const id = await insertConversation(seller);
      const messageId = await insertMessage(seller, id, { body: "original" });

      const edits = [
        `body = 'edited'`,
        `media = '[{"url":"https://x.test","contentType":"image/png"}]'`,
        `direction = 'inbound'`,
        `sender = 'ai'`,
        `provider_message_id = 'SMnew'`,
        `created_at = now() - interval '1 day'`,
        `conversation_id = gen_random_uuid()`,
      ];
      for (const set of edits) {
        await rejection(() =>
          client.query(`update public.messages set ${set} where id = $1`, [
            messageId,
          ]),
        );
      }
      const bodyEdit = await rejection(() =>
        client.query(
          `update public.messages set body = 'edited' where id = $1`,
          [messageId],
        ),
      );
      expect(bodyEdit.message).toMatch(/append-only/);

      await client.query(
        `update public.messages set status = 'delivered' where id = $1`,
        [messageId],
      );
      const { rows } = await client.query(
        `select status, body from public.messages where id = $1`,
        [messageId],
      );
      expect(rows[0]).toEqual({ status: "delivered", body: "original" });
    });
  });
});
