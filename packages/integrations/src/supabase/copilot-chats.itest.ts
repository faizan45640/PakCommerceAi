/**
 * Tier 2 — copilot chat storage.
 *
 * A chat belongs to one seller. These tests attack that boundary, and check
 * the two constraints the Vercel transcript depends on: messages is an array,
 * and the title is a short label rather than the transcript itself.
 */

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, connect, createSeller, withRollback } from "./testing/database.js";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

async function insertChat(
  db: Client,
  seller: { workspaceId: string; sellerId: string },
  title: string | null = "What is running low?",
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.copilot_chats (workspace_id, seller_id, title)
     values ($1, $2, $3)
     returning id`,
    [seller.workspaceId, seller.sellerId, title],
  );
  return rows[0].id;
}

describe("copilot chats", () => {
  it("seller reads only their own chats", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-chat");
      const bob = await createSeller(client, "bob-chat");
      await insertChat(client, alice, "Alice stock");
      await insertChat(client, bob, "Bob stock");

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ title: string }>(
          `select title from public.copilot_chats`,
        );
        return result.rows;
      });

      expect(rows.map((row) => row.title)).toEqual(["Alice stock"]);
    });
  });

  it("seller cannot read another seller's chat", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-hidden");
      const bob = await createSeller(client, "bob-hidden");
      const bobChat = await insertChat(client, bob);

      const rows = await asUser(client, alice.userId, async () => {
        const result = await client.query(`select id from public.copilot_chats where id = $1`, [
          bobChat,
        ]);
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  it("seller cannot insert a chat into another seller's workspace", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-insert");
      const bob = await createSeller(client, "bob-insert");

      await expect(
        asUser(client, alice.userId, () =>
          client.query(
            `insert into public.copilot_chats (workspace_id, seller_id, title)
             values ($1, $2, 'Stolen')`,
            [bob.workspaceId, bob.sellerId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("refuses a transcript that is not an array", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-json");

      await expect(
        client.query(
          `insert into public.copilot_chats (workspace_id, seller_id, messages)
           values ($1, $2, '{"role":"user"}'::jsonb)`,
          [alice.workspaceId, alice.sellerId],
        ),
      ).rejects.toThrow(/copilot_chats_messages_is_array/);
    });
  });

  it("refuses a title longer than the list label", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-title");

      await expect(
        client.query(
          `insert into public.copilot_chats (workspace_id, seller_id, title)
           values ($1, $2, $3)`,
          [alice.workspaceId, alice.sellerId, "a".repeat(121)],
        ),
      ).rejects.toThrow(/copilot_chats_title_max_length/);
    });
  });

  it("logged-out role cannot read chats", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-anon");
      await insertChat(client, alice);

      await expect(
        asAnon(client, () => client.query(`select id from public.copilot_chats`)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("seller can archive and delete their own chat", async () => {
    await withRollback(client, async () => {
      const alice = await createSeller(client, "alice-archive");
      const chatId = await insertChat(client, alice, "Old stock check");

      await asUser(client, alice.userId, async () => {
        await client.query(`update public.copilot_chats set archived_at = now() where id = $1`, [
          chatId,
        ]);
      });

      const archived = await asUser(client, alice.userId, async () => {
        const result = await client.query<{ archived_at: string | null }>(
          `select archived_at from public.copilot_chats where id = $1`,
          [chatId],
        );
        return result.rows[0];
      });
      expect(archived.archived_at).not.toBeNull();

      await asUser(client, alice.userId, async () => {
        await client.query(`delete from public.copilot_chats where id = $1`, [chatId]);
      });

      const gone = await asUser(client, alice.userId, async () => {
        const result = await client.query(`select id from public.copilot_chats where id = $1`, [
          chatId,
        ]);
        return result.rows;
      });
      expect(gone).toHaveLength(0);
    });
  });
});
