import { describe, expect, it } from 'vitest';
import {
  calculateMonthlySpending,
  compareGasolineVsEthanol,
  evaluateFuelConsumptionStats,
  normalCdf,
  studentTOneTailedPValue,
} from '../src/services/statisticalEngine';
import {
  ConsumptionInterval,
  FuelType,
  RefuelEntry,
  Vehicle,
} from '../src/types';

const TEST_VEHICLE: Vehicle = {
  id: 'veh_1',
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

function makeInterval(
  idx: number,
  fuelType: FuelType,
  kmPerLiter: number,
  options: { isMixedTank?: boolean; distanceKm?: number; pricePerLiter?: number } = {}
): ConsumptionInterval {
  const distanceKm = options.distanceKm ?? 325;
  const fuelConsumedLiters = distanceKm / kmPerLiter;
  const pricePerLiter =
    options.pricePerLiter ?? (fuelType === 'GASOLINE' ? 6.0 : 4.0);
  const totalIntervalCost = fuelConsumedLiters * pricePerLiter;
  return {
    id: `int_${fuelType}_${idx}`,
    vehicleId: TEST_VEHICLE.id,
    fromEntryId: `e_${idx}`,
    toEntryId: `e_${idx + 1}`,
    fromDate: `2026-0${Math.min(9, idx + 1)}-01T10:00`,
    toDate: `2026-0${Math.min(9, idx + 1)}-12T10:00`,
    fuelType,
    distanceKm,
    volumeBeforePrevLiters: 13,
    volumeAfterPrevLiters: 45,
    volumeBeforeCurrLiters: 13,
    fuelConsumedLiters,
    uncertaintyLiters: 3.25,
    kmPerLiter,
    kmPerLiterMin: kmPerLiter - 1,
    kmPerLiterMax: kmPerLiter + 1,
    litersPer100Km: Math.round((100 / kmPerLiter) * 100) / 100,
    costPerKm: Math.round((totalIntervalCost / distanceKm) * 1000) / 1000,
    totalIntervalCost,
    isMixedTank: options.isMixedTank ?? false,
    residualOtherFuelRatio: options.isMixedTank ? 0.35 : 0,
    isValid: true,
  };
}

describe('statisticalEngine (Estatística, Mini-Alertas e Comparativo)', () => {
  it('calcula probabilidades da Normal e distribuição t de Student com precisão', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.64485)).toBeCloseTo(0.95, 4);
    // Valor crítico unilateral 5% para t(df=3) é 2.3534
    expect(studentTOneTailedPValue(2.3534, 3)).toBeCloseTo(0.05, 3);
  });

  it('não gera falso-positivo de alerta quando a série de consumo está estável', () => {
    const stableSeries = [
      makeInterval(1, 'GASOLINE', 12.6),
      makeInterval(2, 'GASOLINE', 12.4),
      makeInterval(3, 'GASOLINE', 12.7),
      makeInterval(4, 'GASOLINE', 12.5),
      makeInterval(5, 'GASOLINE', 12.3),
      makeInterval(6, 'GASOLINE', 12.5),
    ];

    const stats = evaluateFuelConsumptionStats(
      stableSeries,
      'GASOLINE',
      TEST_VEHICLE
    );
    expect(stats.intervalCount).toBe(6);
    expect(stats.alerts).toHaveLength(0);
    expect(['NORMAL', 'BOM', 'EXCELENTE']).toContain(stats.latestRating);
  });

  it('dispara mini-alerta estatístico quando o último consumo aumenta significativamente', () => {
    const spikeSeries = [
      makeInterval(1, 'GASOLINE', 12.6),
      makeInterval(2, 'GASOLINE', 12.4),
      makeInterval(3, 'GASOLINE', 12.7),
      makeInterval(4, 'GASOLINE', 12.5),
      makeInterval(5, 'GASOLINE', 12.6),
      makeInterval(6, 'GASOLINE', 8.3), // Piora acentuada (+51% L/100km)
    ];

    const stats = evaluateFuelConsumptionStats(
      spikeSeries,
      'GASOLINE',
      TEST_VEHICLE
    );
    expect(stats.alerts.length).toBeGreaterThanOrEqual(1);
    expect(stats.alerts[0].type).toBe('HIGH_CONSUMPTION_SPIKE');
    expect(stats.alerts[0].pValue).toBeLessThan(0.05);
    expect(stats.alerts[0].zScore).toBeGreaterThan(2);
    expect(stats.latestRating).toBe('CRÍTICO');
  });

  it('detecta tendência persistente de degradação nos últimos 2 intervalos (EWMA)', () => {
    const trendSeries = [
      makeInterval(1, 'GASOLINE', 12.6),
      makeInterval(2, 'GASOLINE', 12.5),
      makeInterval(3, 'GASOLINE', 12.7),
      makeInterval(4, 'GASOLINE', 12.4),
      makeInterval(5, 'GASOLINE', 9.4),
      makeInterval(6, 'GASOLINE', 9.2),
    ];

    const stats = evaluateFuelConsumptionStats(
      trendSeries,
      'GASOLINE',
      TEST_VEHICLE
    );
    expect(stats.alerts.some((a) => a.type === 'DEGRADATION_TREND')).toBe(true);
  });

  it('isola intervalos mistos e nunca mistura Gasolina com Álcool nas estatísticas', () => {
    const mixedList = [
      makeInterval(1, 'GASOLINE', 12.5),
      makeInterval(2, 'GASOLINE', 12.6),
      makeInterval(3, 'GASOLINE', 12.4),
      makeInterval(4, 'GASOLINE', 12.5),
      // Intervalos de Álcool (consumo menor em km/L) não devem derrubar média nem gerar alerta na Gasolina
      makeInterval(5, 'ETHANOL', 8.5),
      makeInterval(6, 'ETHANOL', 8.7),
      // Intervalo misto de Gasolina deve ser excluído da estatística pura
      makeInterval(7, 'GASOLINE', 9.0, { isMixedTank: true }),
    ];

    const gasStats = evaluateFuelConsumptionStats(
      mixedList,
      'GASOLINE',
      TEST_VEHICLE
    );
    const ethStats = evaluateFuelConsumptionStats(
      mixedList,
      'ETHANOL',
      TEST_VEHICLE
    );

    expect(gasStats.intervalCount).toBe(4);
    expect(gasStats.excludedMixedCount).toBe(1);
    expect(gasStats.weightedKmPerLiter).toBeCloseTo(12.5, 1);
    expect(gasStats.alerts).toHaveLength(0);

    expect(ethStats.intervalCount).toBe(2);
    expect(ethStats.weightedKmPerLiter).toBeCloseTo(8.6, 1);
  });

  it('compara Gasolina vs. Álcool usando razão real medida e custo por km', () => {
    const intervals = [
      makeInterval(1, 'GASOLINE', 12.5, { pricePerLiter: 6.0 }),
      makeInterval(2, 'GASOLINE', 12.5, { pricePerLiter: 6.0 }),
      makeInterval(3, 'ETHANOL', 8.75, { pricePerLiter: 3.85 }),
      makeInterval(4, 'ETHANOL', 8.75, { pricePerLiter: 3.85 }),
    ];

    const entries: RefuelEntry[] = [
      {
        id: 'r1',
        vehicleId: TEST_VEHICLE.id,
        date: '2026-10-01T10:00',
        odometerKm: 10000,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 180,
        liters: 30,
        barsBefore: 2,
      },
      {
        id: 'r2',
        vehicleId: TEST_VEHICLE.id,
        date: '2026-10-15T10:00',
        odometerKm: 10300,
        fuelType: 'ETHANOL',
        pricePerLiter: 3.85,
        totalCost: 115.5,
        liters: 30,
        barsBefore: 2,
      },
    ];

    const comparison = compareGasolineVsEthanol(intervals, entries, TEST_VEHICLE);
    // 8.75 / 12.5 = 0.70 exatamente
    expect(comparison.observedRatioEthanolToGasoline).toBe(0.7);
    expect(comparison.maxRecommendedEthanolPrice).toBe(4.2);
    // Etanol: 3.85 / 8.75 = 0.44 R$/km; Gasolina: 6.00 / 12.5 = 0.48 R$/km -> Etanol vence
    expect(comparison.recommendedFuel).toBe('ETHANOL');
    expect(comparison.ethanolCostPerKm).toBeCloseTo(0.44, 2);
    expect(comparison.gasolineCostPerKm).toBeCloseTo(0.48, 2);
  });

  it('agrupa gastos mensais corretamente separados por combustível', () => {
    const entries: RefuelEntry[] = [
      {
        id: 'm1',
        vehicleId: TEST_VEHICLE.id,
        date: '2026-09-05T10:00',
        odometerKm: 10000,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.0,
        totalCost: 150,
        liters: 25,
        barsBefore: 2,
      },
      {
        id: 'm2',
        vehicleId: TEST_VEHICLE.id,
        date: '2026-09-20T10:00',
        odometerKm: 10300,
        fuelType: 'ETHANOL',
        pricePerLiter: 4.0,
        totalCost: 120,
        liters: 30,
        barsBefore: 1,
      },
      {
        id: 'm3',
        vehicleId: TEST_VEHICLE.id,
        date: '2026-10-10T10:00',
        odometerKm: 10600,
        fuelType: 'GASOLINE',
        pricePerLiter: 6.2,
        totalCost: 186,
        liters: 30,
        barsBefore: 2,
      },
    ];

    const monthly = calculateMonthlySpending(entries, TEST_VEHICLE.id);
    expect(monthly).toHaveLength(2);
    expect(monthly[0].monthKey).toBe('2026-09');
    expect(monthly[0].totalCost).toBe(270);
    expect(monthly[0].gasolineCost).toBe(150);
    expect(monthly[0].ethanolCost).toBe(120);
    expect(monthly[1].monthKey).toBe('2026-10');
    expect(monthly[1].totalCost).toBe(186);
  });
});
