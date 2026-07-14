import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Placeholder for screens scheduled in a later milestone (plan §12). */
export function MilestoneNote({ milestone, children }: { milestone: string; children: React.ReactNode }) {
  return (
    <Card className="flex items-start gap-3 border-dashed p-5 text-sm">
      <Construction className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <div className="font-semibold">{milestone}에서 구현 예정</div>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </Card>
  );
}
