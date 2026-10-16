const FALLBACK_GROUP_SIZE = 4;

// Every grouping entry point pre-fills the class's ideal group size, so the fallback rule lives in one place
export function resolveDefaultGroupSize(classTargetGroupSize: number | null | undefined): number {
  return classTargetGroupSize && Number.isInteger(classTargetGroupSize) && classTargetGroupSize > 0
    ? classTargetGroupSize
    : FALLBACK_GROUP_SIZE;
}
