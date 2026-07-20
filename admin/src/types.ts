// Shapes returned by the server's /api/lab/* endpoints. These mirror the pipeline
// artifacts (analysis.json / scenes.json / shorts.json / cast.json / timeline.json), so
// almost everything is optional — a stage that didn't run simply omits its fields.

export interface LabSegment {
  start: number;
  end: number;
  text?: string;
}

export interface LabScene {
  index?: number;
  start: number;
  end: number;
  duration?: number;
  frame?: string;
  text?: string;
  has_dialogue?: boolean;
  vision_score?: number | null;
  vision_reason?: string;
  vision_tags?: string[];
  on_screen_names?: string[];
  on_screen_text?: string[];
  heur_score?: number;
  _prefiltered?: boolean;
}

export interface LabShort {
  rank?: number;
  start: number;
  end: number;
  title?: string;
  reason?: string;
  appeal?: number;
  tags?: string[];
  hook?: string;
}

export interface LabTimelineBlock {
  start: number;
  end: number;
  label?: string;
  summary?: string;
  key_points?: string[];
  who?: string[];
  scene_count?: number;
}

export interface LabCastAppearance {
  start: number;
  end: number;
}

export interface LabCastPerson {
  name: string;
  aliases?: string[];
  status?: string;
  match_type?: string;
  confidence?: number;
  role?: string;
  description?: string;
  scene_count?: number;
  total_sec?: number;
  portrait?: string;
  appearances?: LabCastAppearance[];
}

export interface LabStats {
  duration?: number;
  segments?: number;
  refined?: number;
  scenes?: number;
  scenes_dialogue?: number;
  scenes_silent?: number;
  shorts?: number;
}

export interface LabData {
  video: string | null;
  video_name: string | null;
  stats: LabStats;
  raw: LabSegment[];
  refined: LabSegment[];
  scenes: LabScene[];
  shorts: LabShort[];
  cast: LabCastPerson[] | { people?: LabCastPerson[] } | null;
  timeline: { blocks?: LabTimelineBlock[] } | null;
}

// ── 숏폼 ↔ 롱폼 매칭 ────────────────────────────────────────────────────────

export interface LabChannel {
  channelId: string;
  channelName: string;
  subscribers?: number;
}

export interface LabChannelVideo {
  videoId: string;
  title: string;
  description?: string;
  /** ISO string — channel_videos.publishedAt is TEXT, unlike every other timestamp. */
  publishedAt: string;
  durationSec: number;
  thumbnail: string | null;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  isShort: boolean;
}

/** One operator-made mapping: this short came from that longform's [segStart, segEnd]. */
export interface LabSourceMap {
  shortVideoId: string;
  channelId: string;
  longVideoId: string;
  segStart: number;
  segEnd: number;
  note: string | null;
  /** 'manual' = 사람이 찍음 · 'auto' = 오디오 정렬 추정 (미확인) */
  source: "manual" | "auto";
  /** auto일 때 정렬 신뢰도(peak ratio). 높을수록 확실. */
  confidence: number | null;
  /** 자동 추정을 사람이 확인한 시각. null이면 검수 전. */
  confirmedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LabMatchData {
  channelId: string;
  channelName: string;
  shorts: LabChannelVideo[];
  longs: LabChannelVideo[];
  maps: LabSourceMap[];
}
