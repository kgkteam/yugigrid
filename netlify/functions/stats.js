var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/stats.js
var stats_exports = {};
__export(stats_exports, {
  default: () => stats_default
});
module.exports = __toCommonJS(stats_exports);
var import_blobs = require("@netlify/blobs");
var store = (0, import_blobs.getStore)("yugigrid");
var json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" }
});
var stats_default = async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  const body = await req.json().catch(() => null);
  const { seed, cell, cardId } = body || {};
  if (!seed || !cell || !cardId) {
    return json({ error: "missing fields" }, 400);
  }
  const key = `picks/daily/${seed}.json`;
  for (let i = 0; i < 6; i++) {
    const existing = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    const etag = existing?.etag;
    const cur = existing?.data ?? { cells: {} };

    const next = {
      cells: { ...cur.cells }
    };

    const prevCell = next.cells[cell] || { total: 0, cards: {} };

    const nextCell = {
      total: prevCell.total + 1,
      cards: { ...prevCell.cards }
    };

    nextCell.cards[cardId] = (nextCell.cards[cardId] || 0) + 1;

    next.cells[cell] = nextCell;

    const writeOpts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const res = await store.setJSON(key, next, writeOpts);
    if (res.modified) return json({ ok: true });
  }
  return json({ error: "conflict" }, 409);
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvc3RhdHMuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGdldFN0b3JlIH0gZnJvbSBcIkBuZXRsaWZ5L2Jsb2JzXCI7XHJcblxyXG5jb25zdCBzdG9yZSA9IGdldFN0b3JlKFwieXVnaWdyaWRcIik7XHJcblxyXG5jb25zdCBqc29uID0gKG9iaiwgc3RhdHVzID0gMjAwKSA9PlxyXG4gIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShvYmopLCB7XHJcbiAgICBzdGF0dXMsXHJcbiAgICBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiIH1cclxuICB9KTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGFzeW5jIChyZXEpID0+IHtcclxuICBpZiAocmVxLm1ldGhvZCAhPT0gXCJQT1NUXCIpIHtcclxuICAgIHJldHVybiBqc29uKHsgZXJyb3I6IFwibWV0aG9kIG5vdCBhbGxvd2VkXCIgfSwgNDA1KTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZXEuanNvbigpLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gIGNvbnN0IHsgc2VlZCwgY2VsbCwgY2FyZElkIH0gPSBib2R5IHx8IHt9O1xyXG5cclxuICBpZiAoIXNlZWQgfHwgIWNlbGwgfHwgIWNhcmRJZCkge1xyXG4gICAgcmV0dXJuIGpzb24oeyBlcnJvcjogXCJtaXNzaW5nIGZpZWxkc1wiIH0sIDQwMCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBrZXkgPSBgcGlja3MvZGFpbHkvJHtzZWVkfS5qc29uYDtcclxuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgc3RvcmUuZ2V0V2l0aE1ldGFkYXRhKGtleSwgeyB0eXBlOiBcImpzb25cIiwgY29uc2lzdGVuY3k6IFwic3Ryb25nXCIgfSk7XHJcbiAgICBjb25zdCBjdXIgPSBleGlzdGluZz8uZGF0YSA/PyB7IHRvdGFsOiAwLCBjZWxsczoge30gfTtcclxuICAgIGNvbnN0IGV0YWcgPSBleGlzdGluZz8uZXRhZztcclxuXHJcbiAgICBjb25zdCBuZXh0ID0ge1xyXG4gICAgICB0b3RhbDogY3VyLnRvdGFsICsgMSxcclxuICAgICAgY2VsbHM6IHsgLi4uY3VyLmNlbGxzIH1cclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgY2VsbE1hcCA9IHsgLi4uKG5leHQuY2VsbHNbY2VsbF0gfHwge30pIH07XHJcbiAgICBjZWxsTWFwW2NhcmRJZF0gPSAoY2VsbE1hcFtjYXJkSWRdIHx8IDApICsgMTtcclxuICAgIG5leHQuY2VsbHNbY2VsbF0gPSBjZWxsTWFwO1xyXG5cclxuICAgIGNvbnN0IHdyaXRlT3B0cyA9IGV0YWcgPyB7IG9ubHlJZk1hdGNoOiBldGFnIH0gOiB7IG9ubHlJZk5ldzogdHJ1ZSB9O1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgc3RvcmUuc2V0SlNPTihrZXksIG5leHQsIHdyaXRlT3B0cyk7XHJcbiAgICBpZiAocmVzLm1vZGlmaWVkKSByZXR1cm4ganNvbih7IG9rOiB0cnVlIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGpzb24oeyBlcnJvcjogXCJjb25mbGljdFwiIH0sIDQwOSk7XHJcbn07XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsbUJBQXlCO0FBRXpCLElBQU0sWUFBUSx1QkFBUyxVQUFVO0FBRWpDLElBQU0sT0FBTyxDQUFDLEtBQUssU0FBUyxRQUMxQixJQUFJLFNBQVMsS0FBSyxVQUFVLEdBQUcsR0FBRztBQUFBLEVBQ2hDO0FBQUEsRUFDQSxTQUFTLEVBQUUsZ0JBQWdCLGtDQUFrQztBQUMvRCxDQUFDO0FBRUgsSUFBTyxnQkFBUSxPQUFPLFFBQVE7QUFDNUIsTUFBSSxJQUFJLFdBQVcsUUFBUTtBQUN6QixXQUFPLEtBQUssRUFBRSxPQUFPLHFCQUFxQixHQUFHLEdBQUc7QUFBQSxFQUNsRDtBQUVBLFFBQU0sT0FBTyxNQUFNLElBQUksS0FBSyxFQUFFLE1BQU0sTUFBTSxJQUFJO0FBQzlDLFFBQU0sRUFBRSxNQUFNLE1BQU0sT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUV4QyxNQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRO0FBQzdCLFdBQU8sS0FBSyxFQUFFLE9BQU8saUJBQWlCLEdBQUcsR0FBRztBQUFBLEVBQzlDO0FBRUEsUUFBTSxNQUFNLGVBQWUsSUFBSTtBQUUvQixXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixVQUFNLFdBQVcsTUFBTSxNQUFNLGdCQUFnQixLQUFLLEVBQUUsTUFBTSxRQUFRLGFBQWEsU0FBUyxDQUFDO0FBQ3pGLFVBQU0sTUFBTSxVQUFVLFFBQVEsRUFBRSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFDcEQsVUFBTSxPQUFPLFVBQVU7QUFFdkIsVUFBTSxPQUFPO0FBQUEsTUFDWCxPQUFPLElBQUksUUFBUTtBQUFBLE1BQ25CLE9BQU8sRUFBRSxHQUFHLElBQUksTUFBTTtBQUFBLElBQ3hCO0FBRUEsVUFBTSxVQUFVLEVBQUUsR0FBSSxLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsRUFBRztBQUM5QyxZQUFRLE1BQU0sS0FBSyxRQUFRLE1BQU0sS0FBSyxLQUFLO0FBQzNDLFNBQUssTUFBTSxJQUFJLElBQUk7QUFFbkIsVUFBTSxZQUFZLE9BQU8sRUFBRSxhQUFhLEtBQUssSUFBSSxFQUFFLFdBQVcsS0FBSztBQUNuRSxVQUFNLE1BQU0sTUFBTSxNQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVM7QUFDcEQsUUFBSSxJQUFJLFNBQVUsUUFBTyxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFBQSxFQUM1QztBQUVBLFNBQU8sS0FBSyxFQUFFLE9BQU8sV0FBVyxHQUFHLEdBQUc7QUFDeEM7IiwKICAibmFtZXMiOiBbXQp9Cg==
