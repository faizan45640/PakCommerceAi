/**
 * Tier 2 - tenant isolation and write rules for conversations and messages.
 *
 * Every case checks the boundary from the outside: what seller A, a logged-out
 * visitor, and the copilot's SQL tool can actually do to seller B's rows.
 *
 * Requires the local Supabase stack: `npx supabase start`.
 */

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asUser,
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

/** A seller with one buyer thread that has one inbound message. */
async function sellerWithThread(label: string) {
  const seller: Seller = await createSeller(client, label);
  const {
    rows: [row],
  } = await client.query<{ conversation_id: string; message_id: string }>(
    `select * from public.ingest_inbound_message($1, '0300 1234567', 'Buyer', $2, 'hello', '[]', false)`,
    [seller.workspaceId, `SM-${label}`],
  );
  return {
    seller,
    conversationId: row.conversation_id,
    messageId: row.message_id,
  };
}

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

const insertReply = (
  seller: Seller,
  conversationId: string,
  overrides: Partial<Record<"direction" | "sender" | "status", string>> = {},
) =>
  client.query(
    `insert into public.messages
       (workspace_id, seller_id, conversation_id, direction, sender, body, status)
     values ($1, $2, $3, $4, $5, 'reply', $6)`,
    [
      seller.workspaceId,
      seller.sellerId,
      conversationId,
      overrides.direction ?? "outbound",
      overrides.sender ?? "seller",
      overrides.status ?? "queued",
    ],
  );

describe("conversations isolation", () => {
  it("a seller reads only their own conversations and messages", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      await sellerWithThread("bob");

      const conversations = await asUser(client, alice.seller.userId, () =>
        client.query(`select id from public.conversations`),
      );
      expect(conversations.rows.map((r) => r.id)).toEqual([
        alice.conversationId,
      ]);

      const messages = await asUser(client, alice.seller.userId, () =>
        client.query(`select id from public.messages`),
      );
      expect(messages.rows.map((r) => r.id)).toEqual([alice.messageId]);
    });
  });

  it("a seller cannot update another seller's conversation", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const bob = await sellerWithThread("bob");

      const result = await asUser(client, alice.seller.userId, () =>
        client.query(
          `update public.conversations set unread_count = 0 where id = $1`,
          [bob.conversationId],
        ),
      );
      expect(result.rowCount).toBe(0);
      const { rows } = await client.query(
        `select unread_count from public.conversations where id = $1`,
        [bob.conversationId],
      );
      expect(rows[0].unread_count).toBe(1);
    });
  });

  it("a seller can update state, handoff_reason and unread_count of their own", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const result = await asUser(client, alice.seller.userId, () =>
        client.query(
          `update public.conversations
           set state = 'human_takeover', handoff_reason = 'asked for a person', unread_count = 0
           where id = $1`,
          [alice.conversationId],
        ),
      );
      expect(result.rowCount).toBe(1);
    });
  });

  it("a seller cannot rewrite identity, link or summary columns", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      for (const set of [
        `buyer_phone = '+923009999999'`,
        `workspace_id = gen_random_uuid()`,
        `seller_id = gen_random_uuid()`,
        `customer_id = gen_random_uuid()`,
        `last_message_preview = 'forged'`,
        `buyer_name = 'someone else'`,
      ]) {
        const error = await rejection(() =>
          asUser(client, alice.seller.userId, () =>
            client.query(
              `update public.conversations set ${set} where id = $1`,
              [alice.conversationId],
            ),
          ),
        );
        expect(error.message, set).toMatch(/permission denied/);
      }
    });
  });

  it("a seller cannot make an illegal state move", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      await client.query(
        `update public.conversations set state = 'closed' where id = $1`,
        [alice.conversationId],
      );
      const error = await rejection(() =>
        asUser(client, alice.seller.userId, () =>
          client.query(
            `update public.conversations set state = 'waiting_approval' where id = $1`,
            [alice.conversationId],
          ),
        ),
      );
      expect(error.message).toMatch(/illegal conversation transition/);
    });
  });

  it("a seller cannot insert or delete conversations", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const insert = await rejection(() =>
        asUser(client, alice.seller.userId, () =>
          client.query(
            `insert into public.conversations (workspace_id, seller_id, buyer_phone)
             values ($1, $2, '+923001111111')`,
            [alice.seller.workspaceId, alice.seller.sellerId],
          ),
        ),
      );
      expect(insert.message).toMatch(/permission denied/);

      const del = await rejection(() =>
        asUser(client, alice.seller.userId, () =>
          client.query(`delete from public.conversations where id = $1`, [
            alice.conversationId,
          ]),
        ),
      );
      expect(del.message).toMatch(/permission denied/);
    });
  });
});

describe("messages write rules", () => {
  it("a seller can queue a message in their own conversation, and the summary follows", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      await asUser(client, alice.seller.userId, () =>
        insertReply(alice.seller, alice.conversationId),
      );
      const { rows } = await client.query(
        `select last_message_preview, last_message_sender, unread_count
         from public.conversations where id = $1`,
        [alice.conversationId],
      );
      expect(rows[0]).toEqual({
        last_message_preview: "reply",
        last_message_sender: "seller",
        unread_count: 1,
      });
    });
  });

  it("a seller cannot insert inbound, AI, system or non-queued messages", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const attempts = [
        { direction: "inbound", sender: "buyer", status: "received" },
        { sender: "ai" },
        { sender: "system" },
        { status: "sent" },
        { status: "delivered" },
      ];
      for (const overrides of attempts) {
        const error = await rejection(() =>
          asUser(client, alice.seller.userId, () =>
            insertReply(alice.seller, alice.conversationId, overrides),
          ),
        );
        expect(error.message, JSON.stringify(overrides)).toMatch(
          /row-level security/,
        );
      }
    });
  });

  it("a seller cannot write into another seller's conversation", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const bob = await sellerWithThread("bob");

      // Own ids, someone else's conversation: the composite key refuses it.
      const crossConversation = await rejection(() =>
        asUser(client, alice.seller.userId, () =>
          insertReply(alice.seller, bob.conversationId),
        ),
      );
      expect(crossConversation.message).toMatch(
        /messages_conversation_workspace_fkey/,
      );

      // Someone else's seller_id: the policy refuses it.
      const crossSeller = await rejection(() =>
        asUser(client, alice.seller.userId, () =>
          insertReply(bob.seller, bob.conversationId),
        ),
      );
      expect(crossSeller.message).toMatch(/row-level security/);
    });
  });

  it("a seller cannot update or delete messages", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      for (const sql of [
        `update public.messages set status = 'read' where id = $1`,
        `update public.messages set body = 'edited' where id = $1`,
        `delete from public.messages where id = $1`,
      ]) {
        const error = await rejection(() =>
          asUser(client, alice.seller.userId, () =>
            client.query(sql, [alice.messageId]),
          ),
        );
        expect(error.message, sql).toMatch(/permission denied/);
      }
    });
  });
});

describe("anon and RPC access", () => {
  it("anon cannot read or write either table", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      for (const sql of [
        `select * from public.conversations`,
        `select * from public.messages`,
        `insert into public.messages (workspace_id, seller_id, conversation_id, direction, sender, body, status)
         values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'outbound', 'seller', 'x', 'queued')`,
        `update public.conversations set unread_count = 0`,
      ]) {
        const error = await rejection(() =>
          asAnon(client, () => client.query(sql)),
        );
        expect(error.message, sql).toMatch(/permission denied/);
      }
      expect(alice.conversationId).toBeDefined();
    });
  });

  it("only the service role can run ingest_inbound_message", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const call = () =>
        client.query(
          `select * from public.ingest_inbound_message($1, '+923001234567', null, 'SMx', 'hi', '[]', false)`,
          [alice.seller.workspaceId],
        );

      const asSeller = await rejection(() =>
        asUser(client, alice.seller.userId, call),
      );
      expect(asSeller.message).toMatch(
        /permission denied for function ingest_inbound_message/,
      );
      const asAnonymous = await rejection(() => asAnon(client, call));
      expect(asAnonymous.message).toMatch(
        /permission denied for function ingest_inbound_message/,
      );

      await client.query(`set local role service_role`);
      try {
        const { rows } = await call();
        expect(rows[0].duplicate).toBe(false);
      } finally {
        await client.query(`set local role postgres`);
      }
    });
  });
});

describe("copilot mutateDatabase guards", () => {
  const mutation = (sql: string) =>
    client.query(`select public.run_guarded_mutation($1) as result`, [sql]);

  it("cannot write conversations or messages", async () => {
    await withRollback(client, async () => {
      const alice = await sellerWithThread("alice");
      const statements = [
        `update public.conversations set unread_count = 0 where id = '${alice.conversationId}'`,
        `update public.conversations set state = 'closed' where id = '${alice.conversationId}'`,
        `delete from public.conversations where id = '${alice.conversationId}'`,
        `insert into public.messages (workspace_id, seller_id, conversation_id, direction, sender, body, status)
         values ('${alice.seller.workspaceId}', '${alice.seller.sellerId}', '${alice.conversationId}', 'outbound', 'seller', 'spam', 'queued')`,
        `delete from public.messages where id = '${alice.messageId}'`,
      ];
      for (const sql of statements) {
        const error = await rejection(() =>
          asUser(client, alice.seller.userId, () => mutation(sql)),
        );
        // Deletes are refused even earlier, by missing table privileges.
        expect(error.message, sql).toMatch(
          /copilot_mutation_refused|permission denied/,
        );
      }
    });
  });
});
