import {
  ConsumptionAlert,
  ConsumptionInterval,
  ConsumptionRating,
  FuelComparisonResult,
  FuelStatsSummary,
  FuelType,
  MonthlySpendBucket,
  RefuelEntry,
  Vehicle,
} from '../types';
import { roundTo, sortEntriesChronologically } from './fuelCalculator';

const EWMA_ALPHA = 0.35;
const MIN_REL_SIGMA = 0.04;
const ONE_TAILED_ALPHA = 0.05;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function sampleStdDev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const sumSq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Desvio Absoluto Mediano (MAD) escalado pela constante de consistência normal (1.4826).
 */
function scaledMad(values: number[]): number {
  if (values.length < 2) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return 1.4826 * median(deviations);
}

/**
 * Função de distribuição acumulada da Normal Padrão P(Z <= z).
 * Aproximação de Abramowitz & Stegun (erro máximo < 7.5e-8).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) {
    return z > 0 ? 1 : 0;
  }
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function logGamma(z: number): number {
  const coeffs = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < coeffs.length; j += 1) {
    y += 1;
    ser += coeffs[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3e-12;
  const fpMin = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * Calcula o p-valor unilateral direito P(T >= t) da distribuição t de Student.
 */
export function studentTOneTailedPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 0 : 1;
  if (df >= 30) {
    return Math.max(0, Math.min(1, 1 - normalCdf(t)));
  }
  const safeDf = Math.max(1, df);
  const x = safeDf / (safeDf + t * t);
  const ibeta = regularizedIncompleteBeta(safeDf / 2, 0.5, x);
  if (t >= 0) {
    return Math.max(0, Math.min(1, 0.5 * ibeta));
  }
  return Math.max(0, Math.min(1, 1 - 0.5 * ibeta));
}

function getInmetroCompositeKmL(
  vehicle: Vehicle | undefined,
  fuelType: FuelType
): { city: number | null; highway: number | null; composite: number | null } {
  if (!vehicle) {
    return { city: null, highway: null, composite: null };
  }
  const city =
    fuelType === 'GASOLINE'
      ? vehicle.inmetroCityGasolineKmL ?? null
      : vehicle.inmetroCityEthanolKmL ?? null;
  const highway =
    fuelType === 'GASOLINE'
      ? vehicle.inmetroHighwayGasolineKmL ?? null
      : vehicle.inmetroHighwayEthanolKmL ?? null;

  if (city !== null && highway !== null) {
    return {
      city,
      highway,
      composite: roundTo(0.55 * city + 0.45 * highway, 2),
    };
  }
  if (city !== null) {
    return { city, highway: null, composite: city };
  }
  if (highway !== null) {
    return { city: null, highway, composite: highway };
  }
  return { city: null, highway: null, composite: null };
}

/**
 * Avalia o histórico puro de consumo para um combustível específico (Gasolina ou Álcool),
 * executando testes de hipótese (Z/t de Student), EWMA e emissão de mini-alertas estatísticos.
 */
export function evaluateFuelConsumptionStats(
  intervals: ConsumptionInterval[],
  fuelType: FuelType,
  vehicle?: Vehicle
): FuelStatsSummary {
  const validOfFuel = intervals.filter(
    (item) => item.isValid && item.fuelType === fuelType
  );
  const pureIntervals = validOfFuel.filter((item) => !item.isMixedTank);
  const excludedMixedCount = validOfFuel.length - pureIntervals.length;
  const inmetro = getInmetroCompositeKmL(vehicle, fuelType);

  if (pureIntervals.length === 0) {
    return {
      fuelType,
      intervalCount: 0,
      excludedMixedCount,
      totalDistanceKm: 0,
      totalFuelConsumedLiters: 0,
      weightedKmPerLiter: 0,
      meanKmPerLiter: 0,
      stdDevKmPerLiter: 0,
      meanLPer100Km: 0,
      stdDevLPer100Km: 0,
      medianLPer100Km: 0,
      madLPer100Km: 0,
      ewmaKmPerLiter: 0,
      ewmaLPer100Km: 0,
      latestKmPerLiter: null,
      latestLPer100Km: null,
      latestZScore: null,
      latestPValue: null,
      latestRating: 'SEM_DADOS',
      ratingSummary:
        excludedMixedCount > 0
          ? 'Apenas intervalos com mistura residual de combustível registrados até o momento.'
          : 'Registre pelo menos 2 abastecimentos deste combustível para gerar análises.',
      avgCostPerKm: null,
      latestCostPerKm: null,
      avgPricePerLiter: null,
      inmetroRefKmL: inmetro.composite,
      controlUpperLPer100Km: null,
      controlLowerKmPerLiter: null,
      alerts: [],
    };
  }

  const totalDistanceKm = roundTo(
    pureIntervals.reduce((acc, item) => acc + item.distanceKm, 0),
    2
  );
  const totalFuelConsumedLiters = roundTo(
    pureIntervals.reduce((acc, item) => acc + item.fuelConsumedLiters, 0),
    2
  );
  const totalCost = pureIntervals.reduce(
    (acc, item) => acc + item.totalIntervalCost,
    0
  );

  const kmLSeries = pureIntervals.map((item) => item.kmPerLiter);
  const l100Series = pureIntervals.map((item) => item.litersPer100Km);

  const weightedKmPerLiter =
    totalFuelConsumedLiters > 0
      ? roundTo(totalDistanceKm / totalFuelConsumedLiters, 2)
      : 0;
  const meanKmL = mean(kmLSeries);
  const sdKmL = sampleStdDev(kmLSeries, meanKmL);
  const meanL100 = mean(l100Series);
  const sdL100 = sampleStdDev(l100Series, meanL100);
  const medL100 = median(l100Series);
  const madL100 = scaledMad(l100Series);

  let ewmaL100 = l100Series[0];
  for (let i = 1; i < l100Series.length; i += 1) {
    ewmaL100 = EWMA_ALPHA * l100Series[i] + (1 - EWMA_ALPHA) * ewmaL100;
  }
  const ewmaKmPerLiter = ewmaL100 > 0 ? roundTo(100 / ewmaL100, 2) : 0;

  const latestInterval = pureIntervals[pureIntervals.length - 1];
  const latestKmL = latestInterval.kmPerLiter;
  const latestL100 = latestInterval.litersPer100Km;
  const latestCostPerKm = latestInterval.costPerKm;
  const avgCostPerKm =
    totalDistanceKm > 0 ? roundTo(totalCost / totalDistanceKm, 3) : null;
  const avgPricePerLiter =
    totalFuelConsumedLiters > 0
      ? roundTo(totalCost / totalFuelConsumedLiters, 3)
      : null;

  const alerts: ConsumptionAlert[] = [];
  let latestZScore: number | null = null;
  let latestPValue: number | null = null;
  let controlUpperLPer100Km: number | null = null;
  let controlLowerKmPerLiter: number | null = null;
  let latestRating: ConsumptionRating = 'NORMAL';
  let ratingSummary = '';

  const fuelLabel = fuelType === 'GASOLINE' ? 'Gasolina' : 'Álcool';

  // Caso A: Histórico suficiente (>= 4 intervalos puros -> >= 3 de base) para teste t / Z formal
  if (pureIntervals.length >= 4) {
    const baselineL100 = l100Series.slice(0, -1);
    const muBase = mean(baselineL100);
    const sdBase = sampleStdDev(baselineL100, muBase);
    const madBase = scaledMad(baselineL100);
    const sigmaEff = Math.max(sdBase, madBase, MIN_REL_SIGMA * muBase);

    const z = (latestL100 - muBase) / sigmaEff;
    const pVal = studentTOneTailedPValue(z, baselineL100.length - 1);

    latestZScore = roundTo(z, 2);
    latestPValue = roundTo(pVal, 4);

    controlUpperLPer100Km = roundTo(muBase + 1.645 * sigmaEff, 2);
    controlLowerKmPerLiter = roundTo(100 / controlUpperLPer100Km, 2);

    const baselineKmL = 100 / muBase;
    const percentIncrease = ((latestL100 - muBase) / muBase) * 100;

    if (pVal < ONE_TAILED_ALPHA && percentIncrease >= 8) {
      const isCritical = pVal < 0.01 || percentIncrease >= 20;
      alerts.push({
        id: `alert_spike_${fuelType}_${latestInterval.id}`,
        fuelType,
        type: 'HIGH_CONSUMPTION_SPIKE',
        severity: isCritical ? 'critical' : 'warning',
        title: `Aumento significativo de consumo (${fuelLabel})`,
        message: `O último intervalo fez ${latestKmL.toFixed(
          2
        )} km/L (${latestL100.toFixed(2)} L/100km), um aumento de ${percentIncrease.toFixed(
          1
        )}% no gasto por km em relação à sua média base de ${baselineKmL.toFixed(
          2
        )} km/L (z = +${z.toFixed(2)}, p = ${pVal.toFixed(4)}).`,
        zScore: roundTo(z, 2),
        tScore: roundTo(z, 2),
        pValue: roundTo(pVal, 4),
        percentIncreaseInConsumption: roundTo(percentIncrease, 1),
        lastKmPerLiter: latestKmL,
        baselineKmPerLiter: roundTo(baselineKmL, 2),
      });
    }

    // Verifica também degradação persistente nos últimos 2 intervalos (EWMA / janela móvel)
    if (pureIntervals.length >= 5) {
      const earlyL100 = l100Series.slice(0, -2);
      const recentTwoL100 = l100Series.slice(-2);
      const muEarly = mean(earlyL100);
      const sdEarly = sampleStdDev(earlyL100, muEarly);
      const madEarly = scaledMad(earlyL100);
      const sigmaEarly = Math.max(sdEarly, madEarly, MIN_REL_SIGMA * muEarly);
      const recentMean = mean(recentTwoL100);
      const seWindow = sigmaEarly / Math.sqrt(2);
      const windowZ = (recentMean - muEarly) / seWindow;
      const windowP = studentTOneTailedPValue(windowZ, earlyL100.length - 1);
      const bothElevated =
        recentTwoL100[0] > muEarly + 1.15 * sigmaEarly &&
        recentTwoL100[1] > muEarly + 1.15 * sigmaEarly;
      const ewmaElevated = ewmaL100 > muEarly + 1.1 * sigmaEarly;
      const pctIncreaseWindow = ((recentMean - muEarly) / muEarly) * 100;

      if (
        bothElevated &&
        ewmaElevated &&
        windowP < ONE_TAILED_ALPHA &&
        pctIncreaseWindow >= 10
      ) {
        const earlyKmL = 100 / muEarly;
        const recentKmL = 100 / recentMean;
        alerts.push({
          id: `alert_trend_${fuelType}_${latestInterval.id}`,
          fuelType,
          type: 'DEGRADATION_TREND',
          severity: pctIncreaseWindow >= 18 ? 'critical' : 'warning',
          title: `Tendência persistente de piora (${fuelLabel})`,
          message: `Os últimos 2 intervalos sustentam média de ${recentKmL.toFixed(
            2
          )} km/L contra ${earlyKmL.toFixed(
            2
          )} km/L do histórico anterior (+${pctIncreaseWindow.toFixed(
            1
          )}% de consumo, EWMA em ${ewmaKmPerLiter.toFixed(
            2
          )} km/L, p = ${windowP.toFixed(4)}).`,
          zScore: roundTo(windowZ, 2),
          tScore: roundTo(windowZ, 2),
          pValue: roundTo(windowP, 4),
          percentIncreaseInConsumption: roundTo(pctIncreaseWindow, 1),
          lastKmPerLiter: roundTo(recentKmL, 2),
          baselineKmPerLiter: roundTo(earlyKmL, 2),
        });
      }
    }

    // Classificação qualitativa do último intervalo
    if (alerts.some((a) => a.severity === 'critical') || z >= 2.33) {
      latestRating = 'CRÍTICO';
      ratingSummary = `Consumo muito pior que seu padrão histórico (z = +${z.toFixed(
        2
      )}, p = ${pVal.toFixed(3)}). Verifique calibragem, filtro ou qualidade do posto.`;
    } else if (alerts.length > 0 || z >= 1.2) {
      latestRating = 'ATENÇÃO';
      ratingSummary = `Consumo acima do habitual (+${Math.max(
        0,
        percentIncrease
      ).toFixed(1)}% em L/100km). Acompanhe o próximo abastecimento.`;
    } else if (z <= -0.75) {
      latestRating = 'EXCELENTE';
      ratingSummary = `Excelente rendimento: ${Math.abs(percentIncrease).toFixed(
        1
      )}% mais econômico que sua média base histórica.`;
    } else if (z <= -0.2) {
      latestRating = 'BOM';
      ratingSummary = `Bom desempenho no último trecho, melhor que sua média histórica (${baselineKmL.toFixed(
        2
      )} km/L).`;
    } else {
      latestRating = 'NORMAL';
      ratingSummary = `Consumo dentro da faixa estatística esperada (média base ${baselineKmL.toFixed(
        2
      )} km/L).`;
    }
  } else {
    // Caso B: Cold-start (1 a 3 intervalos puros) — compara com INMETRO se disponível
    const refKmL = inmetro.city ?? inmetro.composite;
    if (refKmL !== null && refKmL > 0) {
      const refL100 = 100 / refKmL;
      const pctIncrease = ((latestL100 - refL100) / refL100) * 100;
      const relDiffKmL = (latestKmL - refKmL) / refKmL;
      // Assume desvio típico de ~7% em ciclo urbano real para estimar z aproximado
      const approxZ = (latestL100 - refL100) / (0.07 * refL100);
      const approxP = 1 - normalCdf(approxZ);

      latestZScore = roundTo(approxZ, 2);
      latestPValue = roundTo(approxP, 4);
      controlUpperLPer100Km = roundTo(refL100 * 1.15, 2);
      controlLowerKmPerLiter = roundTo(100 / controlUpperLPer100Km, 2);

      if (pctIncrease > 18) {
        alerts.push({
          id: `alert_inmetro_${fuelType}_${latestInterval.id}`,
          fuelType,
          type: 'BELOW_INMETRO_BENCHMARK',
          severity: pctIncrease > 28 ? 'critical' : 'warning',
          title: `Consumo bem abaixo do padrão INMETRO (${fuelLabel})`,
          message: `O trecho registrou ${latestKmL.toFixed(
            2
          )} km/L, um gasto ${pctIncrease.toFixed(
            1
          )}% maior que a referência urbana do modelo (${refKmL.toFixed(
            1
          )} km/L).`,
          zScore: roundTo(approxZ, 2),
          pValue: roundTo(approxP, 4),
          percentIncreaseInConsumption: roundTo(pctIncrease, 1),
          lastKmPerLiter: latestKmL,
          baselineKmPerLiter: refKmL,
        });
      }

      if (relDiffKmL >= 0.05) {
        latestRating = 'EXCELENTE';
        ratingSummary = `Superou a referência INMETRO urbana (${refKmL.toFixed(
          1
        )} km/L).`;
      } else if (relDiffKmL >= -0.04) {
        latestRating = 'BOM';
        ratingSummary = `Alinhado à referência INMETRO urbana (${refKmL.toFixed(
          1
        )} km/L).`;
      } else if (relDiffKmL >= -0.15) {
        latestRating = 'NORMAL';
        ratingSummary = `Dentro da tolerância inicial; mais abastecimentos calibram sua base própria.`;
      } else if (relDiffKmL >= -0.22) {
        latestRating = 'ATENÇÃO';
        ratingSummary = `Rendimento ${pctIncrease.toFixed(
          1
        )}% abaixo do padrão urbano INMETRO (${refKmL.toFixed(1)} km/L).`;
      } else {
        latestRating = 'CRÍTICO';
        ratingSummary = `Rendimento muito abaixo do padrão urbano INMETRO (${refKmL.toFixed(
          1
        )} km/L).`;
      }
    } else {
      latestRating = 'NORMAL';
      ratingSummary = `Amostra inicial (${pureIntervals.length} intervalo(s)). Registre ao menos 4 intervalos puros para ativar testes t/Z completos.`;
    }
  }

  return {
    fuelType,
    intervalCount: pureIntervals.length,
    excludedMixedCount,
    totalDistanceKm,
    totalFuelConsumedLiters,
    weightedKmPerLiter,
    meanKmPerLiter: roundTo(meanKmL, 2),
    stdDevKmPerLiter: roundTo(sdKmL, 2),
    meanLPer100Km: roundTo(meanL100, 2),
    stdDevLPer100Km: roundTo(sdL100, 2),
    medianLPer100Km: roundTo(medL100, 2),
    madLPer100Km: roundTo(madL100, 2),
    ewmaKmPerLiter,
    ewmaLPer100Km: roundTo(ewmaL100, 2),
    latestKmPerLiter: latestKmL,
    latestLPer100Km: latestL100,
    latestZScore,
    latestPValue,
    latestRating,
    ratingSummary,
    avgCostPerKm,
    latestCostPerKm,
    avgPricePerLiter,
    inmetroRefKmL: inmetro.composite,
    controlUpperLPer100Km,
    controlLowerKmPerLiter,
    alerts,
  };
}

function findLatestPrice(
  entries: RefuelEntry[],
  fuelType: FuelType,
  vehicleId?: string
): number | null {
  const filtered = sortEntriesChronologically(
    entries.filter(
      (e) =>
        e.fuelType === fuelType &&
        e.pricePerLiter > 0 &&
        (!vehicleId || e.vehicleId === vehicleId)
    )
  );
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1].pricePerLiter;
}

/**
 * Compara o desempenho econômico e energético entre Gasolina e Álcool (Etanol)
 * utilizando exclusivamente intervalos puros de cada combustível.
 */
export function compareGasolineVsEthanol(
  intervals: ConsumptionInterval[],
  entries: RefuelEntry[],
  vehicle?: Vehicle
): FuelComparisonResult {
  const gasolineStats = evaluateFuelConsumptionStats(
    intervals,
    'GASOLINE',
    vehicle
  );
  const ethanolStats = evaluateFuelConsumptionStats(
    intervals,
    'ETHANOL',
    vehicle
  );

  const observedRatioEthanolToGasoline =
    gasolineStats.weightedKmPerLiter > 0 && ethanolStats.weightedKmPerLiter > 0
      ? roundTo(
          ethanolStats.weightedKmPerLiter / gasolineStats.weightedKmPerLiter,
          3
        )
      : null;

  const gasInmetro = getInmetroCompositeKmL(vehicle, 'GASOLINE').composite;
  const ethInmetro = getInmetroCompositeKmL(vehicle, 'ETHANOL').composite;
  const inmetroRatioEthanolToGasoline =
    gasInmetro && ethInmetro ? roundTo(ethInmetro / gasInmetro, 3) : null;

  const effectiveParityThreshold =
    observedRatioEthanolToGasoline ?? inmetroRatioEthanolToGasoline ?? 0.7;

  const latestGasolinePrice =
    findLatestPrice(entries, 'GASOLINE', vehicle?.id) ??
    gasolineStats.avgPricePerLiter;
  const latestEthanolPrice =
    findLatestPrice(entries, 'ETHANOL', vehicle?.id) ??
    ethanolStats.avgPricePerLiter;

  const maxRecommendedEthanolPrice =
    latestGasolinePrice !== null
      ? roundTo(latestGasolinePrice * effectiveParityThreshold, 2)
      : null;

  const effectiveGasKmL =
    gasolineStats.weightedKmPerLiter > 0
      ? gasolineStats.weightedKmPerLiter
      : gasInmetro;
  const effectiveEthKmL =
    ethanolStats.weightedKmPerLiter > 0
      ? ethanolStats.weightedKmPerLiter
      : ethInmetro;

  const gasolineCostPerKm =
    latestGasolinePrice !== null && effectiveGasKmL && effectiveGasKmL > 0
      ? roundTo(latestGasolinePrice / effectiveGasKmL, 3)
      : gasolineStats.avgCostPerKm;

  const ethanolCostPerKm =
    latestEthanolPrice !== null && effectiveEthKmL && effectiveEthKmL > 0
      ? roundTo(latestEthanolPrice / effectiveEthKmL, 3)
      : ethanolStats.avgCostPerKm;

  let recommendedFuel: FuelType | 'TIE' | 'INSUFFICIENT_DATA' =
    'INSUFFICIENT_DATA';
  let estimatedSavingsPercent: number | null = null;
  let verdict =
    'Registre abastecimentos e preços de Gasolina e Álcool para comparar o custo real por km.';

  if (gasolineCostPerKm !== null && ethanolCostPerKm !== null) {
    const diffRatio =
      Math.abs(gasolineCostPerKm - ethanolCostPerKm) /
      Math.max(gasolineCostPerKm, ethanolCostPerKm);

    if (diffRatio < 0.02) {
      recommendedFuel = 'TIE';
      estimatedSavingsPercent = roundTo(diffRatio * 100, 1);
      verdict = `Empate técnico (~R$ ${gasolineCostPerKm.toFixed(
        2
      )}/km). Razão energética considerada: ${(
        effectiveParityThreshold * 100
      ).toFixed(1)}%.`;
    } else if (ethanolCostPerKm < gasolineCostPerKm) {
      recommendedFuel = 'ETHANOL';
      estimatedSavingsPercent = roundTo(
        ((gasolineCostPerKm - ethanolCostPerKm) / gasolineCostPerKm) * 100,
        1
      );
      verdict = `Álcool é ${estimatedSavingsPercent.toFixed(
        1
      )}% mais vantajoso agora (R$ ${ethanolCostPerKm.toFixed(
        3
      )}/km vs R$ ${gasolineCostPerKm.toFixed(
        3
      )}/km; teto de paridade: R$ ${maxRecommendedEthanolPrice?.toFixed(2)}/L).`;
    } else {
      recommendedFuel = 'GASOLINE';
      estimatedSavingsPercent = roundTo(
        ((ethanolCostPerKm - gasolineCostPerKm) / ethanolCostPerKm) * 100,
        1
      );
      verdict = `Gasolina é ${estimatedSavingsPercent.toFixed(
        1
      )}% mais econômica por km (R$ ${gasolineCostPerKm.toFixed(
        3
      )}/km vs R$ ${ethanolCostPerKm.toFixed(
        3
      )}/km; álcool só compensa abaixo de R$ ${maxRecommendedEthanolPrice?.toFixed(
        2
      )}/L).`;
    }
  } else if (maxRecommendedEthanolPrice !== null) {
    verdict = `Com a Gasolina a R$ ${latestGasolinePrice?.toFixed(
      2
    )}/L e paridade de ${(effectiveParityThreshold * 100).toFixed(
      1
    )}%, o Álcool compensa se custar até R$ ${maxRecommendedEthanolPrice.toFixed(
      2
    )}/L.`;
  }

  return {
    gasolineStats,
    ethanolStats,
    observedRatioEthanolToGasoline,
    inmetroRatioEthanolToGasoline,
    effectiveParityThreshold,
    latestGasolinePrice,
    latestEthanolPrice,
    maxRecommendedEthanolPrice,
    gasolineCostPerKm,
    ethanolCostPerKm,
    recommendedFuel,
    estimatedSavingsPercent,
    verdict,
  };
}

const MONTH_ABBR_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/**
 * Agrega gastos financeiros e litros abastecidos por mês, separados por combustível.
 */
export function calculateMonthlySpending(
  entries: RefuelEntry[],
  vehicleId?: string
): MonthlySpendBucket[] {
  const buckets = new Map<string, MonthlySpendBucket>();

  for (const entry of entries) {
    if (vehicleId && entry.vehicleId !== vehicleId) {
      continue;
    }
    const parsed = new Date(entry.date);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const year = parsed.getFullYear();
    const monthIdx = parsed.getMonth();
    const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const label = `${MONTH_ABBR_PT[monthIdx]}/${String(year).slice(-2)}`;

    let bucket = buckets.get(monthKey);
    if (!bucket) {
      bucket = {
        monthKey,
        label,
        totalCost: 0,
        gasolineCost: 0,
        ethanolCost: 0,
        totalLiters: 0,
        gasolineLiters: 0,
        ethanolLiters: 0,
        entryCount: 0,
      };
      buckets.set(monthKey, bucket);
    }

    bucket.totalCost = roundTo(bucket.totalCost + entry.totalCost, 2);
    bucket.totalLiters = roundTo(bucket.totalLiters + entry.liters, 3);
    bucket.entryCount += 1;

    if (entry.fuelType === 'GASOLINE') {
      bucket.gasolineCost = roundTo(bucket.gasolineCost + entry.totalCost, 2);
      bucket.gasolineLiters = roundTo(bucket.gasolineLiters + entry.liters, 3);
    } else {
      bucket.ethanolCost = roundTo(bucket.ethanolCost + entry.totalCost, 2);
      bucket.ethanolLiters = roundTo(bucket.ethanolLiters + entry.liters, 3);
    }
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

export type TimeWindow = '6M' | '1Y' | 'ALL';

export const DEFAULT_TIME_WINDOW: TimeWindow = '6M';

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  '6M': '6 meses',
  '1Y': '1 ano',
  ALL: 'Global',
};

/**
 * Filtra intervalos e abastecimentos pela janela temporal selecionada (6M, 1Y ou Global)
 * para evitar que registros muito antigos (ex: 3 anos atrás) distorçam a média recente.
 */
export function filterDataByTimeWindow(
  intervals: ConsumptionInterval[],
  entries: RefuelEntry[],
  window: TimeWindow,
  referenceDate: Date = new Date()
): { intervals: ConsumptionInterval[]; entries: RefuelEntry[] } {
  if (window === 'ALL') {
    return { intervals, entries };
  }
  const days = window === '6M' ? 183 : 365;
  const cutoffMs = referenceDate.getTime() - days * 24 * 60 * 60 * 1000;

  return {
    intervals: intervals.filter((it) => {
      const ts = new Date(it.toDate).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    }),
    entries: entries.filter((e) => {
      const ts = new Date(e.date).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    }),
  };
}
