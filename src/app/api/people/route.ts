import { api } from "@/lib/http";
import { createPerson } from "@/lib/mutations";
import { todayIso } from "@/lib/util";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => api(req, (db, body) => createPerson(db, body, todayIso()));
