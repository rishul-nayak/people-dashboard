import { api, isUuid } from "@/lib/http";
import { deletePerson, updatePerson } from "@/lib/mutations";
import { todayIso } from "@/lib/util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return api(req, async (db, body) => (isUuid(id) ? updatePerson(db, id, body, todayIso()) : null));
};

export const DELETE = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return api(req, async (db) => (isUuid(id) ? deletePerson(db, id) : null));
};
