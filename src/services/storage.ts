import { AppState, ColorPaletteId, RefuelEntry, Vehicle } from '../types';

const STORAGE_KEY = 'fueltracker_state_v1';
const VALID_PALETTES: ColorPaletteId[] = [
  'terracotta',
  'espresso',
  'nordic',
  'matcha',
];

export const EMPTY_APP_STATE: AppState = {
  vehicles: [],
  selectedVehicleId: null,
  entries: [],
  palette: 'terracotta',
};

/**
 * Carrega o estado local imediatamente a partir do localStorage.
 */
export function loadAppState(): AppState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return EMPTY_APP_STATE;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_APP_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const vehicles = Array.isArray(parsed.vehicles) ? parsed.vehicles : [];
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const selectedVehicleId =
      typeof parsed.selectedVehicleId === 'string' &&
      vehicles.some((v) => v.id === parsed.selectedVehicleId)
        ? parsed.selectedVehicleId
        : vehicles[0]?.id ?? null;

    return {
      vehicles,
      selectedVehicleId,
      entries,
      googleClientId:
        typeof parsed.googleClientId === 'string'
          ? parsed.googleClientId
          : undefined,
      lastGoogleSyncAt:
        typeof parsed.lastGoogleSyncAt === 'string'
          ? parsed.lastGoogleSyncAt
          : undefined,
      palette: VALID_PALETTES.includes(parsed.palette as ColorPaletteId)
        ? (parsed.palette as ColorPaletteId)
        : 'terracotta',
    };
  } catch {
    return EMPTY_APP_STATE;
  }
}

/**
 * Persiste o estado local instantaneamente no localStorage.
 */
export function saveAppState(state: AppState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignora falha de quota para não travar a interface
  }
}

/**
 * Cria um conjunto realista de dados demonstrativos (VW Polo 1.0 TSI com
 * abastecimentos parciais por palitinhos em Gasolina e Álcool + alerta no último trecho).
 */
export function createDemoState(): AppState {
  const demoVehicle: Vehicle = {
    id: 'demo_polo_tsi',
    nickname: 'Polo TSI (Demo)',
    brand: 'Volkswagen',
    model: 'Polo 1.0 TSI',
    year: 2023,
    specId: 'vw-polo-10-tsi',
    tankCapacityLiters: 52,
    gaugeSegments: 8,
    reserveLiters: 7,
    reserveOffsetLiters: 0,
    inmetroCityGasolineKmL: 12.5,
    inmetroHighwayGasolineKmL: 15.1,
    inmetroCityEthanolKmL: 8.7,
    inmetroHighwayEthanolKmL: 10.6,
    validationStatus: 'VERIFIED',
    validationScore: 95,
    createdAt: '2026-08-01T10:00:00.000Z',
  };

  // Tanque 52L, 8 palitinhos -> 6.5 L por palitinho
  const demoEntries: RefuelEntry[] = [
    {
      id: 'demo_e1',
      vehicleId: demoVehicle.id,
      date: '2026-08-05T09:15',
      odometerKm: 24100,
      fuelType: 'GASOLINE',
      pricePerLiter: 5.99,
      totalCost: 155.74,
      liters: 26.0,
      barsBefore: 2, // 13L -> após abastecer 39L
      station: 'Posto Ipiranga Centro',
    },
    {
      id: 'demo_e2',
      vehicleId: demoVehicle.id,
      date: '2026-08-18T18:20',
      odometerKm: 24432, // +332 km, consumiu 39 - 13 = 26L => 12.77 km/L
      fuelType: 'GASOLINE',
      pricePerLiter: 6.05,
      totalCost: 157.3,
      liters: 26.0,
      barsBefore: 2, // 13L -> após abastecer 39L
      station: 'Shell Select',
    },
    {
      id: 'demo_e3',
      vehicleId: demoVehicle.id,
      date: '2026-09-02T08:40',
      odometerKm: 24758, // +326 km, consumiu 39 - 13 = 26L => 12.54 km/L
      fuelType: 'GASOLINE',
      pricePerLiter: 6.09,
      totalCost: 197.93,
      liters: 32.5,
      barsBefore: 2, // 13L -> após abastecer 45.5L
      station: 'Petrobras BR',
    },
    {
      id: 'demo_e4',
      vehicleId: demoVehicle.id,
      date: '2026-09-16T17:10',
      odometerKm: 25165, // +407 km, consumiu 45.5 - 13 = 32.5L => 12.52 km/L
      fuelType: 'GASOLINE',
      pricePerLiter: 6.12,
      totalCost: 198.9,
      liters: 32.5,
      barsBefore: 2, // 13L -> após abastecer 45.5L
      station: 'Shell Select',
    },
    {
      id: 'demo_e5',
      vehicleId: demoVehicle.id,
      date: '2026-09-29T19:05',
      odometerKm: 25577, // +412 km, consumiu 45.5 - 13 = 32.5L => 12.68 km/L
      fuelType: 'GASOLINE',
      pricePerLiter: 6.15,
      totalCost: 159.9,
      liters: 26.0,
      barsBefore: 2, // 13L -> após abastecer 39L
      station: 'Posto Ipiranga Centro',
    },
    {
      id: 'demo_e6',
      vehicleId: demoVehicle.id,
      date: '2026-10-12T10:30',
      odometerKm: 25892, // +315 km, consumiu 39 - 6.5 = 32.5L => 9.69 km/L (piora estatística!)
      fuelType: 'ETHANOL',
      pricePerLiter: 3.98,
      totalCost: 155.22,
      liters: 39.0,
      barsBefore: 1, // 6.5L de gasolina (~14% do total de 45.5L -> tanque quase puro de etanol!)
      station: 'Posto Ale',
    },
    {
      id: 'demo_e7',
      vehicleId: demoVehicle.id,
      date: '2026-10-25T16:45',
      odometerKm: 26242, // +350 km, consumiu 45.5 - 6.5 = 39L => 8.97 km/L (Etanol puro)
      fuelType: 'ETHANOL',
      pricePerLiter: 4.05,
      totalCost: 157.95,
      liters: 39.0,
      barsBefore: 1, // 6.5L -> após abastecer 45.5L
      station: 'Shell Select',
    },
    {
      id: 'demo_e8',
      vehicleId: demoVehicle.id,
      date: '2026-11-08T11:00',
      odometerKm: 26588, // +346 km, consumiu 45.5 - 6.5 = 39L => 8.87 km/L (Etanol puro)
      fuelType: 'ETHANOL',
      pricePerLiter: 4.09,
      totalCost: 159.51,
      liters: 39.0,
      barsBefore: 1,
      station: 'Petrobras BR',
    },
  ];

  return {
    vehicles: [demoVehicle],
    selectedVehicleId: demoVehicle.id,
    entries: demoEntries,
  };
}
