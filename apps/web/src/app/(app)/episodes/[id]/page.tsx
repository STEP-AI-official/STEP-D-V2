import { EpisodeDetail } from "@/components/episode-detail";

export default async function EpisodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <EpisodeDetail episodeId={id} initialTab={tab} />;
}
