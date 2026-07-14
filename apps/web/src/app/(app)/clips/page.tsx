import { ClipsView } from "@/components/clips-view";

export default async function ClipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <ClipsView
      initial={{
        status: sp.status ?? "all",
        type: sp.type ?? "all",
        program: sp.program ?? "all",
        q: sp.q ?? "",
      }}
    />
  );
}
