export declare const BIS_TIME_CONSTANT_SECONDS: number
export declare const BIS_TARGETS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>
export declare function bisTargetForDepth(depth: number): number
export declare function advanceBisIndex(previous: number, depth: number, deltaSeconds: number): number
export declare function tofReadingFromBlock(block: number, minimumCount?: number): { count: number; ratio: number }
