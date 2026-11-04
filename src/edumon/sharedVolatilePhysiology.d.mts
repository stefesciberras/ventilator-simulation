export declare const SEVO_MAC_PERCENT: number
export declare function anaestheticDepthFromMac(mac: number, sensitivity?: number): 1 | 2 | 3 | 4 | 5
export declare function effectiveSevoDepth(etSevoPercent: number, sensitivity?: number): 1 | 2 | 3 | 4 | 5
export declare function advanceEndTidalSevo(options: {
  etSevoPercent: number; fiSevoPercent: number; alveolarVentilationLMin: number;
  frcMl: number; dtSeconds: number
}): number
export declare function estimatedAlveolarVentilationLMin(respiratory: {
  tidalVolumeMl?: number; deadSpaceMl?: number; respiratoryRate?: number
} | undefined): number
