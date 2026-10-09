import { CheckCircle2, CircleDashed, FlaskConical, Stethoscope, TriangleAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LAB_STAGE_LABEL, LAB_STAGE_TONE, type LabStage } from "@/lib/lab-workflow";

const STAGE_ICON: Record<LabStage, typeof CheckCircle2> = {
  new: CircleDashed,
  atLab: FlaskConical,
  late: TriangleAlert,
  clinic: Stethoscope,
  done: CheckCircle2,
  cancelled: XCircle,
};

/** Lab işinin durumu — her ekranda aynı ad, renk ve ikon (bkz. src/lib/lab-workflow.ts). */
export function LabStatusBadge({ stage, size = "sm" }: { stage: LabStage; size?: "sm" | "md" }) {
  return (
    <Badge tone={LAB_STAGE_TONE[stage]} icon={STAGE_ICON[stage]} size={size}>
      {LAB_STAGE_LABEL[stage]}
    </Badge>
  );
}
