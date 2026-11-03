import { getStore } from "@edgeone/pages-blob";
import { handleRequest, type AnswerStore } from "../../server/handler";
import type { Settings } from "../../server/security";

export async function onRequest(context: { request: Request; env: Settings; clientIp?: string }) {
  // Authentication is supplied by the EdgeOne Cloud Functions runtime.
  // Never include a storage token in the browser bundle.
  const blob = getStore("dinner-answers");
  const store: AnswerStore = {
    get: key => blob.get(key, { type: "json", consistency: "strong" }),
    set: (key, value) => blob.setJSON(key, value, { cacheControl: "private, no-store" }),
    list: async (prefix, cursor) => {
      const result = await blob.list({ prefix, cursor, limit: 50, paginate: false, consistency: "strong" });
      return { keys: result.blobs.map(b => b.key), cursor: result.cursor };
    },
  };
  return handleRequest(context.request, context.env, store, context.clientIp);
}
