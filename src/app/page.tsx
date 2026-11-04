import { Dashboard } from "@/components/dashboard";
import { loadData } from "@/lib/notion";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const sp = await searchParams;
  const data = await loadData(sp.demo === "1");
  return <Dashboard data={data} />;
}
