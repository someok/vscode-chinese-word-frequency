declare module "segmentit" {
  export type SegmentOutput = string | { w?: string };

  export class Segment {
    doSegment(input: string, options?: { simple?: boolean }): SegmentOutput[];
  }

  export function useDefault<T extends Segment>(segment: T): T;
}
