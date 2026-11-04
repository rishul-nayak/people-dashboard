import { api, isUuid } from "@/lib/http";
import { setPromiseDone } from "@/lib/mutations";

export const dynamic = "force-dynamic";

export const PATCH = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return api(req, async (db, body) => (isUuid(id) ? setPromiseDone(db, id, !!body?.done) : null));
};
