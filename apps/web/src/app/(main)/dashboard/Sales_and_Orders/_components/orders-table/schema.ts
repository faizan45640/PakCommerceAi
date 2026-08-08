// orders-table/schema.ts
import z from "zod";

const ordersSchema = z.object({
  id: z.string(),
  customer: z.string(),
  email: z.string(),
  channel: z.string(),
  amount: z.number(),
  status: z.string(),
  items: z.number(),
  date: z.string(),
  city: z.string(),
});

export type OrderRow = z.infer<typeof ordersSchema>;