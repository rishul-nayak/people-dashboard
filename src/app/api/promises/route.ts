import { api } from "@/lib/http";
import { createPromise } from "@/lib/mutations";
import { todayIso } from "@/lib/util";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => api(req, (db, body) => createPromise(db, body, todayIso()));
