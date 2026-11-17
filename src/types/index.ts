export type FuelType = 'GASOLINE' | 'ETHANOL';

export const DEFAULT_FUEL_TYPE: FuelType = 'GASOLINE';

export const FUEL_LABELS: Record<FuelType, string> = {
  GASOLINE: 'Gasolina',
  ETHANOL: 'Álcool (Etanol)',
};

export interface VehicleSpec {
  id: string;
  brand: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  engine: string;
  tankCapacityLiters: number;
  gaugeSegments: number;
  reserveLiters: number;
  reserveOffsetLiters: number;
  inmetroCityGasolineKmL: number;
  inmetroHighwayGasolineKmL: number;
  inmetroCityEthanolKmL: number;
  inmetroHighwayEthanolKmL: number;
  gaugeNotes?: string;
}

export type VehicleValidationStatus =
  | 'VERIFIED'
  | 'ADJUSTED_WARNING'
  | 'UNVERIFIED_CUSTOM';

export interface CrossValidationResult {
  isValid: boolean;
  status: VehicleValidationStatus;
  confidenceScore: number;
  matchedSpec: VehicleSpec | null;
  fipeVerified: boolean;
  warnings: string[];
  errors: string[];
  autoFilledFields: string[];
}

export interface Vehicle {
  id: string;
  nickname: string;
  brand: string;
  model: string;
  year: number;
  fipeCode?: string;
  specId?: string;
  tankCapacityLiters: number;
  gaugeSegments: number;
  reserveLiters: number;
  reserveOffsetLiters: number;
  inmetroCityGasolineKmL?: number;
  inmetroHighwayGasolineKmL?: number;
  inmetroCityEthanolKmL?: number;
  inmetroHighwayEthanolKmL?: number;
  validationStatus: VehicleValidationStatus;
  validationScore: number;
  createdAt: string;
}

export interface RefuelEntry {
  id: string;
  vehicleId: string;
  date: string;
  odometerKm: number;
  fuelType: FuelType;
  pricePerLiter: number;
  totalCost: number;
  liters: number;
  barsBefore: number;
  fullTank?: boolean;
  station?: string;
  notes?: string;
}

export interface ConsumptionInterval {
  id: string;
  vehicleId: string;
  fromEntryId: string;
  toEntryId: string;
  fromDate: string;
  toDate: string;
  fuelType: FuelType;
  distanceKm: number;
  volumeBeforePrevLiters: number;
  volumeAfterPrevLiters: number;
  volumeBeforeCurrLiters: number;
  fuelConsumedLiters: number;
  uncertaintyLiters: number;
  kmPerLiter: number;
  kmPerLiterMin: number;
  kmPerLiterMax: number;
  litersPer100Km: number;
  costPerKm: number;
  totalIntervalCost: number;
  isMixedTank: boolean;
  residualOtherFuelRatio: number;
  isValid: boolean;
  invalidReason?: string;
}

export type ConsumptionRating =
  | 'EXCELENTE'
  | 'BOM'
  | 'NORMAL'
  | 'ATENÇÃO'
  | 'CRÍTICO'
  | 'SEM_DADOS';

export type AlertSeverity = 'warning' | 'critical';

export interface ConsumptionAlert {
  id: string;
  fuelType: FuelType;
  type:
    | 'HIGH_CONSUMPTION_SPIKE'
    | 'DEGRADATION_TREND'
    | 'BELOW_INMETRO_BENCHMARK';
  severity: AlertSeverity;
  title: string;
  message: string;
  zScore: number;
  tScore?: number;
  pValue: number;
  percentIncreaseInConsumption: number;
  lastKmPerLiter: number;
  baselineKmPerLiter: number;
}

export interface FuelStatsSummary {
  fuelType: FuelType;
  intervalCount: number;
  excludedMixedCount: number;
  totalDistanceKm: number;
  totalFuelConsumedLiters: number;
  weightedKmPerLiter: number;
  meanKmPerLiter: number;
  stdDevKmPerLiter: number;
  meanLPer100Km: number;
  stdDevLPer100Km: number;
  medianLPer100Km: number;
  madLPer100Km: number;
  ewmaKmPerLiter: number;
  ewmaLPer100Km: number;
  latestKmPerLiter: number | null;
  latestLPer100Km: number | null;
  latestZScore: number | null;
  latestPValue: number | null;
  latestRating: ConsumptionRating;
  ratingSummary: string;
  avgCostPerKm: number | null;
  latestCostPerKm: number | null;
  avgPricePerLiter: number | null;
  inmetroRefKmL: number | null;
  controlUpperLPer100Km: number | null;
  controlLowerKmPerLiter: number | null;
  alerts: ConsumptionAlert[];
}

export interface FuelComparisonResult {
  gasolineStats: FuelStatsSummary;
  ethanolStats: FuelStatsSummary;
  observedRatioEthanolToGasoline: number | null;
  inmetroRatioEthanolToGasoline: number | null;
  effectiveParityThreshold: number;
  latestGasolinePrice: number | null;
  latestEthanolPrice: number | null;
  maxRecommendedEthanolPrice: number | null;
  gasolineCostPerKm: number | null;
  ethanolCostPerKm: number | null;
  recommendedFuel: FuelType | 'TIE' | 'INSUFFICIENT_DATA';
  estimatedSavingsPercent: number | null;
  verdict: string;
}

export interface MonthlySpendBucket {
  monthKey: string;
  label: string;
  totalCost: number;
  gasolineCost: number;
  ethanolCost: number;
  totalLiters: number;
  gasolineLiters: number;
  ethanolLiters: number;
  entryCount: number;
}

export type ColorPaletteId = 'terracotta' | 'espresso' | 'nordic' | 'matcha';

export interface AppState {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  entries: RefuelEntry[];
  googleClientId?: string;
  lastGoogleSyncAt?: string;
  palette?: ColorPaletteId;
}
