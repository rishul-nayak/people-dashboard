import { Dashboard } from "@/components/dashboard";
import { loadAny } from "@/lib/load";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const sp = await searchParams;
  const data = await loadAny(sp.demo === "1");
  return <Dashboard data={data} />;
}
