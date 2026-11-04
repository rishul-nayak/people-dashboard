// Turns Meta's webhook JSON into a flat list of messages we care about.
export type Incoming = {
  id: string;
  from: string; // digits, with country code
  kind: "text" | "voice" | "photo" | "button" | "contact" | "other";
  text: string;
  mediaId?: string;
  mime?: string;
  buttonId?: string;
  contextId?: string;
  forwarded?: boolean;
};

const cleanMime = (m: unknown, fallback: string) => String(m || fallback).split(";")[0].trim() || fallback;

export function parseWebhook(body: any): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const m of change?.value?.messages || []) {
        if (!m?.id || !m?.from) continue;
        const base = { id: String(m.id), from: String(m.from), contextId: m.context?.id, forwarded: !!m.context?.forwarded };
        switch (m.type) {
          case "text":
            out.push({ ...base, kind: "text", text: String(m.text?.body || "") });
            break;
          case "audio":
            out.push({ ...base, kind: "voice", text: "", mediaId: m.audio?.id, mime: cleanMime(m.audio?.mime_type, "audio/ogg") });
            break;
          case "image":
            out.push({ ...base, kind: "photo", text: String(m.image?.caption || ""), mediaId: m.image?.id, mime: cleanMime(m.image?.mime_type, "image/jpeg") });
            break;
          case "document": {
            const mime = cleanMime(m.document?.mime_type, "");
            if (mime.startsWith("image/") || mime.startsWith("audio/")) {
              out.push({ ...base, kind: mime.startsWith("image/") ? "photo" : "voice", text: String(m.document?.caption || ""), mediaId: m.document?.id, mime });
            } else out.push({ ...base, kind: "other", text: "" });
            break;
          }
          case "interactive": {
            const id = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id;
            out.push({ ...base, kind: "button", text: "", buttonId: id ? String(id) : undefined });
            break;
          }
          case "contacts": {
            const text = (m.contacts || [])
              .map((c: any) => {
                const name = c?.name?.formatted_name || "";
                const phones = (c?.phones || []).map((p: any) => p.phone).filter(Boolean).join(", ");
                const org = c?.org?.company || "";
                return [`Contact card: ${name}`, org && `company ${org}`, phones && `phone ${phones}`].filter(Boolean).join(", ");
              })
              .join("\n");
            out.push({ ...base, kind: "contact", text });
            break;
          }
          default:
            out.push({ ...base, kind: "other", text: "" });
        }
      }
    }
  }
  return out;
}
