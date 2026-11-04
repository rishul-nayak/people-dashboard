import { api, isUuid } from "@/lib/http";
import { touchPerson } from "@/lib/mutations";
import { todayIso } from "@/lib/util";

export const dynamic = "force-dynamic";

export const POST = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return api(req, async (db, body) => (isUuid(id) ? touchPerson(db, id, body?.note, todayIso()) : null));
};
