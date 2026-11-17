import {
  ConsumptionInterval,
  FuelType,
  RefuelEntry,
  Vehicle,
} from '../types';

const MIXED_TANK_THRESHOLD = 0.2;
const MIN_VALID_CONSUMPTION_L = 0.2;
const MIN_PLAUSIBLE_KML = 2.0;
const MAX_PLAUSIBLE_KML = 40.0;

/**
 * Arredonda um número para N casas decimais com proteção contra imprecisão binária.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calcula automaticamente os litros abastecidos a partir do Valor Total (R$) e Preço/L (R$/L).
 */
export function calculateLiters(
  totalCost: number,
  pricePerLiter: number
): number {
  if (
    !Number.isFinite(totalCost) ||
    !Number.isFinite(pricePerLiter) ||
    totalCost <= 0 ||
    pricePerLiter <= 0
  ) {
    return 0;
  }
  return roundTo(totalCost / pricePerLiter, 3);
}

/**
 * Calcula o valor total (R$) caso o usuário informe litros e preço por litro.
 */
export function calculateTotalCost(
  liters: number,
  pricePerLiter: number
): number {
  if (
    !Number.isFinite(liters) ||
    !Number.isFinite(pricePerLiter) ||
    liters <= 0 ||
    pricePerLiter <= 0
  ) {
    return 0;
  }
  return roundTo(liters * pricePerLiter, 2);
}

/**
 * Retorna quantos litros equivalem a 1 "palitinho" do marcador do veículo.
 */
export function getGaugeStepLiters(vehicle: Pick<Vehicle, 'tankCapacityLiters' | 'gaugeSegments' | 'reserveOffsetLiters'>): number {
  const segments = Math.max(1, vehicle.gaugeSegments);
  const offset = Math.max(
    0,
    Math.min(vehicle.reserveOffsetLiters ?? 0, vehicle.tankCapacityLiters * 0.25)
  );
  return (vehicle.tankCapacityLiters - offset) / segments;
}

/**
 * Converte a quantidade de palitinhos no painel antes de abastecer em volume estimado (L).
 * Fórmula: V(b) = V_reserva_offset + (b / N_barras) * (C_tanque - V_reserva_offset)
 */
export function estimateTankVolumeFromBars(
  barsBefore: number,
  vehicle: Pick<Vehicle, 'tankCapacityLiters' | 'gaugeSegments' | 'reserveOffsetLiters'>
): number {
  const segments = Math.max(1, vehicle.gaugeSegments);
  const clampedBars = Math.max(0, Math.min(barsBefore, segments));
  const offset = Math.max(
    0,
    Math.min(vehicle.reserveOffsetLiters ?? 0, vehicle.tankCapacityLiters * 0.25)
  );
  const volume =
    offset + (clampedBars / segments) * (vehicle.tankCapacityLiters - offset);
  return roundTo(Math.min(vehicle.tankCapacityLiters, volume), 2);
}

/**
 * Ordena abastecimentos cronologicamente por data e odômetro como desempate.
 */
export function sortEntriesChronologically(entries: RefuelEntry[]): RefuelEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.odometerKm - b.odometerKm;
  });
}

/**
 * Calcula todos os intervalos de consumo entre abastecimentos consecutivos de um veículo,
 * propagando a incerteza da leitura de palitinhos e separando misturas residuais entre
 * Gasolina e Álcool.
 */
export function calculateConsumptionIntervals(
  entries: RefuelEntry[],
  vehicle: Vehicle
): ConsumptionInterval[] {
  const vehicleEntries = sortEntriesChronologically(
    entries.filter((entry) => entry.vehicleId === vehicle.id)
  );

  if (vehicleEntries.length < 2) {
    return [];
  }

  const stepLiters = getGaugeStepLiters(vehicle);
  const intervals: ConsumptionInterval[] = [];

  // Rastreia a fração real de cada combustível no tanque ao longo dos abastecimentos
  let tankShare: Record<FuelType, number> = {
    GASOLINE: vehicleEntries[0].fuelType === 'GASOLINE' ? 1 : 0,
    ETHANOL: vehicleEntries[0].fuelType === 'ETHANOL' ? 1 : 0,
  };

  for (let i = 1; i < vehicleEntries.length; i += 1) {
    const prev = vehicleEntries[i - 1];
    const curr = vehicleEntries[i];

    const volumeBeforePrev = estimateTankVolumeFromBars(prev.barsBefore, vehicle);
    const rawAfterPrev = prev.fullTank
      ? vehicle.tankCapacityLiters
      : volumeBeforePrev + prev.liters;
    const isSaturatedTop =
      Boolean(prev.fullTank) || rawAfterPrev >= vehicle.tankCapacityLiters;
    const volumeAfterPrev = roundTo(
      Math.min(vehicle.tankCapacityLiters, rawAfterPrev),
      2
    );

    const effectiveAddedLiters = Math.max(0, volumeAfterPrev - volumeBeforePrev);
    const totalVolumeAfterPrev = volumeBeforePrev + effectiveAddedLiters;

    // Atualiza composição do tanque após o abastecimento prev (i - 1)
    if (totalVolumeAfterPrev > 0) {
      if (i === 1) {
        // No primeiro evento do histórico, assume-se o residual compatível com o mesmo combustível inicial
        tankShare = {
          GASOLINE: prev.fuelType === 'GASOLINE' ? 1 : 0,
          ETHANOL: prev.fuelType === 'ETHANOL' ? 1 : 0,
        };
      } else {
        const prevGasVol = volumeBeforePrev * tankShare.GASOLINE;
        const prevEthVol = volumeBeforePrev * tankShare.ETHANOL;
        const newGasVol =
          prevGasVol + (prev.fuelType === 'GASOLINE' ? effectiveAddedLiters : 0);
        const newEthVol =
          prevEthVol + (prev.fuelType === 'ETHANOL' ? effectiveAddedLiters : 0);
        const sumVol = newGasVol + newEthVol;
        tankShare = {
          GASOLINE: sumVol > 0 ? newGasVol / sumVol : prev.fuelType === 'GASOLINE' ? 1 : 0,
          ETHANOL: sumVol > 0 ? newEthVol / sumVol : prev.fuelType === 'ETHANOL' ? 1 : 0,
        };
      }
    }

    const otherFuel: FuelType =
      prev.fuelType === 'GASOLINE' ? 'ETHANOL' : 'GASOLINE';
    const residualOtherFuelRatio = roundTo(tankShare[otherFuel], 4);
    const isMixedTank = residualOtherFuelRatio > MIXED_TANK_THRESHOLD;

    const volumeBeforeCurr = estimateTankVolumeFromBars(curr.barsBefore, vehicle);
    const distanceKm = roundTo(curr.odometerKm - prev.odometerKm, 2);
    const fuelConsumedLiters = roundTo(volumeAfterPrev - volumeBeforeCurr, 2);

    const sigmaPrev = isSaturatedTop ? 0 : 0.5 * stepLiters;
    const sigmaCurr = 0.5 * stepLiters;
    const uncertaintyLiters = roundTo(
      Math.sqrt(sigmaPrev * sigmaPrev + sigmaCurr * sigmaCurr),
      2
    );

    let isValid = true;
    let invalidReason: string | undefined;

    if (distanceKm <= 0) {
      isValid = false;
      invalidReason = 'Odômetro não avançou entre os abastecimentos.';
    } else if (fuelConsumedLiters <= MIN_VALID_CONSUMPTION_L) {
      isValid = false;
      invalidReason =
        'Volume consumido estimado inválido (<= 0,2 L). Confira os palitinhos.';
    }

    const rawKmPerLiter = isValid ? distanceKm / fuelConsumedLiters : 0;

    if (
      isValid &&
      (rawKmPerLiter < MIN_PLAUSIBLE_KML || rawKmPerLiter > MAX_PLAUSIBLE_KML)
    ) {
      isValid = false;
      invalidReason = `Consumo calculado (${rawKmPerLiter.toFixed(
        1
      )} km/L) fora da faixa plausível (${MIN_PLAUSIBLE_KML}–${MAX_PLAUSIBLE_KML} km/L).`;
    }

    const kmPerLiter = isValid ? roundTo(rawKmPerLiter, 2) : 0;
    const kmPerLiterMin = isValid
      ? roundTo(distanceKm / (fuelConsumedLiters + uncertaintyLiters), 2)
      : 0;
    const kmPerLiterMax = isValid
      ? roundTo(
          fuelConsumedLiters > uncertaintyLiters
            ? distanceKm / (fuelConsumedLiters - uncertaintyLiters)
            : rawKmPerLiter * 1.4,
          2
        )
      : 0;
    const litersPer100Km =
      isValid && rawKmPerLiter > 0 ? roundTo(100 / rawKmPerLiter, 2) : 0;
    const totalIntervalCost = isValid
      ? roundTo(fuelConsumedLiters * prev.pricePerLiter, 2)
      : 0;
    const costPerKm =
      isValid && distanceKm > 0 ? roundTo(totalIntervalCost / distanceKm, 3) : 0;

    intervals.push({
      id: `int_${prev.id}_${curr.id}`,
      vehicleId: vehicle.id,
      fromEntryId: prev.id,
      toEntryId: curr.id,
      fromDate: prev.date,
      toDate: curr.date,
      fuelType: prev.fuelType,
      distanceKm,
      volumeBeforePrevLiters: volumeBeforePrev,
      volumeAfterPrevLiters: volumeAfterPrev,
      volumeBeforeCurrLiters: volumeBeforeCurr,
      fuelConsumedLiters,
      uncertaintyLiters,
      kmPerLiter,
      kmPerLiterMin,
      kmPerLiterMax,
      litersPer100Km,
      costPerKm,
      totalIntervalCost,
      isMixedTank,
      residualOtherFuelRatio,
      isValid,
      invalidReason,
    });
  }

  return intervals;
}
