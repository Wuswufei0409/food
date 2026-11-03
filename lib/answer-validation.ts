import { restaurants } from "./restaurants";

export function validateAnswer(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("提交内容格式不正确。");
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id)) throw new Error("请刷新页面后重试。");
  if (b.kind !== "restaurants" && b.kind !== "idea") throw new Error("请选择提交方式。");
  if (!Array.isArray(b.selected) || b.selected.length > 6 || new Set(b.selected).size !== b.selected.length || b.selected.some(id => typeof id !== "string" || !restaurants.some(r => r.id === id))) throw new Error("餐厅选项不正确。");
  if (typeof b.message !== "string" || b.message.length > 1000) throw new Error("留言最多可以写 1000 个字。");
  const message = b.message.trim();
  if (b.kind === "restaurants" && (!b.selected.length || message)) throw new Error("先选一家心动的餐厅吧。");
  if (b.kind === "idea" && (!message || b.selected.length)) throw new Error("写下一点你的想法吧。");
  return { id: b.id, kind: b.kind, message, restaurants: JSON.stringify(restaurants.filter(r => b.selected instanceof Array && b.selected.includes(r.id)).map(r => ({ id: r.id, name: r.name, branch: r.branch, price: r.price, priceNote: r.priceNote, address: r.address }))) };
}
