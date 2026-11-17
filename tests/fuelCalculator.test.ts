import { describe, expect, it } from 'vitest';
import {
  calculateConsumptionIntervals,
  calculateLiters,
  calculateTotalCost,
  estimateTankVolumeFromBars,
} from '../src/services/fuelCalculator';
import { DEFAULT_FUEL_TYPE, RefuelEntry, Vehicle } from '../src/types';

const POLO_VEHICLE: Vehicle = {
  id: 'veh_polo',
  nickname: 'Polo TSI',
  brand: 'Volkswagen',
  model: 'Polo 1.0 TSI',
  year: 2023,
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
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('fuelCalculator', () => {
  it('mantém Gasolina como combustível padrão (default)', () => {
    expect(DEFAULT_FUEL_TYPE).toBe('GASOLINE');
  });

  it('calcula automaticamente os litros a partir do Preço/L e Valor Total', () => {
    expect(calculateLiters(180, 6.0)).toBe(30);
    expect(calculateLiters(155.74, 5.99)).toBe(26);
    expect(calculateLiters(200, 6.19)).toBe(32.31);
    expect(calculateLiters(0, 6.0)).toBe(0);
    expect(calculateLiters(100, -5)).toBe(0);
    expect(calculateLiters(Number.NaN, 6)).toBe(0);
  });

  it('calcula o valor total a partir de litros e preço por litro', () => {
    expect(calculateTotalCost(26, 5.99)).toBe(155.74);
    expect(calculateTotalCost(0, 5.99)).toBe(0);
  });

  it('estima o volume no tanque a partir dos palitinhos do marcador', () => {
    // 52 L / 8 palitinhos = 6.5 L por palitinho
    expect(estimateTankVolumeFromBars(0, POLO_VEHICLE)).toBe(0);
    expect(estimateTankVolumeFromBars(2, POLO_VEHICLE)).toBe(13);
    expect(estimateTankVolumeFromBars(4, POLO_VEHICLE)).toBe(26);
    expect(estimateTankVolumeFromBars(8, POLO_VEHICLE)).toBe(52);
    // Clamp fora dos limites
    expect(estimateTankVolumeFromBars(12, POLO_VEHICLE)).toBe(52);
    expect(estimateTankVolumeFromBars(-2, POLO_VEHICLE)).toBe(0);

    // Com reserveOffsetLiters = 4: V(b) = 4 + (b/8)*(52-4) = 4 + 6*b
    const withOffset: Vehicle = { ...POLO_VEHICLE, reserveOffsetLiters: 4 };
    expect(estimateTankVolumeFromBars(0, withOffset)).toBe(4);
    expect(estimateTankVolumeFromBars(4, withOffset)).toBe(28);
    expect(estimateTankVolumeFromBars(8, withOffset)).toBe(52);
  });

  it('calcula consumo médio em abastecimentos parciais usando palitinhos', () => {
    const entries: RefuelEntry[] = [
      {
        id: 'e1',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-01T10:00',
        odometerKm: 10000,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 156.0,
        liters: 26.0,
        barsBefore: 2, // 13L + 26L = 39L no tanque
      },
      {
        id: 'e2',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-12T10:00',
        odometerKm: 10325, // +325 km
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 180.0,
        liters: 30.0,
        barsBefore: 2, // restavam 13L -> consumiu 39 - 13 = 26L -> 325/26 = 12.50 km/L
      },
    ];

    const intervals = calculateConsumptionIntervals(entries, POLO_VEHICLE);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].isValid).toBe(true);
    expect(intervals[0].fuelType).toBe('GASOLINE');
    expect(intervals[0].fuelConsumedLiters).toBe(26);
    expect(intervals[0].distanceKm).toBe(325);
    expect(intervals[0].kmPerLiter).toBe(12.5);
    expect(intervals[0].litersPer100Km).toBe(8);
    expect(intervals[0].costPerKm).toBe(0.48);
    expect(intervals[0].kmPerLiterMin).toBeLessThan(intervals[0].kmPerLiter);
    expect(intervals[0].kmPerLiterMax).toBeGreaterThan(intervals[0].kmPerLiter);
    expect(intervals[0].isMixedTank).toBe(false);
  });

  it('sinaliza tanque misto quando há mistura residual > 20% ao trocar de Gasolina para Álcool', () => {
    const entries: RefuelEntry[] = [
      {
        id: 'e1',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-01T10:00',
        odometerKm: 10000,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 180.0,
        liters: 30.0,
        barsBefore: 2, // 13L + 30L = 43L gasolina
      },
      {
        id: 'e2',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-10T10:00',
        odometerKm: 10200,
        fuelType: 'ETHANOL',
        pricePerLiter: 4.0,
        totalCost: 104.0,
        liters: 26.0,
        barsBefore: 4, // Ainda havia 26L de Gasolina (50% do tanque de 52L!)
      },
      {
        id: 'e3',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-20T10:00',
        odometerKm: 10520,
        fuelType: 'ETHANOL',
        pricePerLiter: 4.0,
        totalCost: 156.0,
        liters: 39.0,
        barsBefore: 1, // 6.5L misto (3.25L gas) + 39L etanol => gasolina cai para ~7%
      },
      {
        id: 'e4',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-10-01T10:00',
        odometerKm: 10840,
        fuelType: 'ETHANOL',
        pricePerLiter: 4.0,
        totalCost: 156.0,
        liters: 39.0,
        barsBefore: 1,
      },
    ];

    const intervals = calculateConsumptionIntervals(entries, POLO_VEHICLE);
    expect(intervals).toHaveLength(3);
    // Intervalo 0 (e1 -> e2): era gasolina pura
    expect(intervals[0].fuelType).toBe('GASOLINE');
    expect(intervals[0].isMixedTank).toBe(false);
    // Intervalo 1 (e2 -> e3): tinha 50% gasolina residual no etanol -> tanque misto
    expect(intervals[1].fuelType).toBe('ETHANOL');
    expect(intervals[1].isMixedTank).toBe(true);
    expect(intervals[1].residualOtherFuelRatio).toBeCloseTo(0.5, 2);
    // Intervalo 2 (e3 -> e4): gasolina residual caiu para ~7% -> etanol puro
    expect(intervals[2].fuelType).toBe('ETHANOL');
    expect(intervals[2].isMixedTank).toBe(false);
  });

  it('marca intervalo como inválido quando o odômetro não avança', () => {
    const entries: RefuelEntry[] = [
      {
        id: 'e1',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-01T10:00',
        odometerKm: 10500,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 120.0,
        liters: 20,
        barsBefore: 2,
      },
      {
        id: 'e2',
        vehicleId: POLO_VEHICLE.id,
        date: '2026-09-05T10:00',
        odometerKm: 10450,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 120.0,
        liters: 20,
        barsBefore: 2,
      },
    ];

    const intervals = calculateConsumptionIntervals(entries, POLO_VEHICLE);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].isValid).toBe(false);
  });
});
