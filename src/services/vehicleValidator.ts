import { VEHICLE_SPECS_DB } from '../data/vehicleSpecsDb';
import {
  CrossValidationResult,
  Vehicle,
  VehicleSpec,
  VehicleValidationStatus,
} from '../types';

export interface VehicleRegistrationInput {
  nickname?: string;
  brand: string;
  model: string;
  year: number;
  tankCapacityLiters: number;
  gaugeSegments: number;
  reserveLiters?: number;
  reserveOffsetLiters?: number;
  inmetroCityGasolineKmL?: number;
  inmetroHighwayGasolineKmL?: number;
  inmetroCityEthanolKmL?: number;
  inmetroHighwayEthanolKmL?: number;
  fipeCode?: string;
}

export interface FipeBrand {
  codigo: string;
  nome: string;
}

export interface FipeModel {
  codigo: number;
  nome: string;
}

const FIPE_BASE_URL = 'https://parallelum.com.br/fipe/api/v1/carros';
const FIPE_TIMEOUT_MS = 1500;

let cachedBrands: FipeBrand[] | null = null;
const cachedModelsByBrand = new Map<string, FipeModel[]>();

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 0);
}

/**
 * Busca rápida no catálogo técnico local por texto livre (marca, modelo ou motor).
 */
export function lookupVehicleSpecs(query: string, limit = 8): VehicleSpec[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return VEHICLE_SPECS_DB.slice(0, limit);
  }
  const queryTokens = tokenize(normalizedQuery);

  const scored = VEHICLE_SPECS_DB.map((spec) => {
    const haystack = normalizeText(
      `${spec.brand} ${spec.model} ${spec.engine}`
    );
    let score = 0;
    if (haystack.includes(normalizedQuery)) {
      score += 50;
    }
    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += 15;
      }
    }
    return { spec, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.spec);
}

/**
 * Encontra a melhor correspondência na base técnica a partir de marca, modelo e ano.
 */
export function findBestSpecMatch(
  brand: string,
  model: string,
  year?: number
): VehicleSpec | null {
  const normBrand = normalizeText(brand);
  const normModel = normalizeText(model);
  if (!normBrand && !normModel) {
    return null;
  }

  const modelTokens = tokenize(normModel);
  let bestSpec: VehicleSpec | null = null;
  let bestScore = 0;

  for (const spec of VEHICLE_SPECS_DB) {
    const specBrand = normalizeText(spec.brand);
    const specModel = normalizeText(`${spec.model} ${spec.engine}`);
    let score = 0;

    if (normBrand && (specBrand.includes(normBrand) || normBrand.includes(specBrand))) {
      score += 30;
    } else if (normBrand) {
      // Penaliza marca explicitamente diferente
      continue;
    }

    if (normModel && specModel.includes(normModel)) {
      score += 40;
    }

    let matchedModelTokens = 0;
    for (const token of modelTokens) {
      if (specModel.includes(token)) {
        matchedModelTokens += 1;
        score += 15;
      }
    }

    if (modelTokens.length > 0 && matchedModelTokens === 0) {
      continue;
    }

    if (year && year >= spec.yearStart && year <= spec.yearEnd) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSpec = spec;
    }
  }

  return bestScore >= 40 ? bestSpec : null;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = FIPE_TIMEOUT_MS,
  fetcher: typeof fetch = fetch
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta marcas na API pública da Tabela FIPE com cache e fallback silencioso.
 */
export async function fetchFipeBrands(
  fetcher: typeof fetch = fetch
): Promise<FipeBrand[]> {
  if (cachedBrands) {
    return cachedBrands;
  }
  const data = await fetchJsonWithTimeout<FipeBrand[]>(
    `${FIPE_BASE_URL}/marcas`,
    FIPE_TIMEOUT_MS,
    fetcher
  );
  if (Array.isArray(data)) {
    cachedBrands = data;
    return data;
  }
  return [];
}

/**
 * Consulta modelos na API pública da Tabela FIPE para uma marca específica.
 */
export async function fetchFipeModels(
  brandCode: string,
  fetcher: typeof fetch = fetch
): Promise<FipeModel[]> {
  const cached = cachedModelsByBrand.get(brandCode);
  if (cached) {
    return cached;
  }
  const data = await fetchJsonWithTimeout<{ modelos: FipeModel[] }>(
    `${FIPE_BASE_URL}/marcas/${encodeURIComponent(brandCode)}/modelos`,
    FIPE_TIMEOUT_MS,
    fetcher
  );
  if (data && Array.isArray(data.modelos)) {
    cachedModelsByBrand.set(brandCode, data.modelos);
    return data.modelos;
  }
  return [];
}

/**
 * Verifica de forma assíncrona e não-bloqueante se marca + modelo existem na Tabela FIPE.
 */
export async function verifyVehicleInFipe(
  brand: string,
  model: string,
  fetcher: typeof fetch = fetch
): Promise<{ verified: boolean; fipeBrand?: FipeBrand; fipeModel?: FipeModel }> {
  const normBrand = normalizeText(brand);
  const normModel = normalizeText(model);
  if (!normBrand || !normModel) {
    return { verified: false };
  }

  const brands = await fetchFipeBrands(fetcher);
  const matchedBrand = brands.find((b) => {
    const nb = normalizeText(b.nome);
    return nb === normBrand || nb.includes(normBrand) || normBrand.includes(nb);
  });

  if (!matchedBrand) {
    return { verified: false };
  }

  const models = await fetchFipeModels(matchedBrand.codigo, fetcher);
  const modelTokens = tokenize(normModel);
  const matchedModel = models.find((m) => {
    const nm = normalizeText(m.nome);
    return (
      nm.includes(normModel) ||
      (modelTokens.length > 0 && modelTokens.every((t) => nm.includes(t)))
    );
  });

  return {
    verified: Boolean(matchedModel),
    fipeBrand: matchedBrand,
    fipeModel: matchedModel,
  };
}

/**
 * Executa a validação cruzada obrigatória no momento de cadastrar um carro:
 * confronta capacidade do tanque, quantidade de palitinhos e médias INMETRO
 * contra o catálogo técnico público e (opcionalmente) a verificação FIPE.
 */
export function crossValidateVehicleRegistration(
  input: VehicleRegistrationInput,
  explicitSpec?: VehicleSpec | null,
  fipeVerified = false
): CrossValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const autoFilledFields: string[] = [];

  if (!input.brand.trim()) {
    errors.push('Informe a marca do veículo.');
  }
  if (!input.model.trim()) {
    errors.push('Informe o modelo do veículo.');
  }

  const maxYear = new Date().getFullYear() + 2;
  if (!Number.isFinite(input.year) || input.year < 1970 || input.year > maxYear) {
    errors.push(`Ano do veículo deve estar entre 1970 e ${maxYear}.`);
  }

  if (
    !Number.isFinite(input.tankCapacityLiters) ||
    input.tankCapacityLiters < 20 ||
    input.tankCapacityLiters > 120
  ) {
    errors.push('Capacidade do tanque deve estar entre 20 L e 120 L.');
  }

  if (
    !Number.isInteger(input.gaugeSegments) ||
    input.gaugeSegments < 4 ||
    input.gaugeSegments > 24
  ) {
    errors.push('O número de palitinhos do marcador deve ser um inteiro entre 4 e 24.');
  }

  if (
    input.reserveLiters !== undefined &&
    (!Number.isFinite(input.reserveLiters) ||
      input.reserveLiters < 0 ||
      input.reserveLiters >= input.tankCapacityLiters * 0.4)
  ) {
    errors.push('Capacidade de reserva inválida para o tamanho do tanque.');
  }

  const matchedSpec =
    explicitSpec !== undefined
      ? explicitSpec
      : findBestSpecMatch(input.brand, input.model, input.year);

  let status: VehicleValidationStatus = 'UNVERIFIED_CUSTOM';
  let confidenceScore = fipeVerified ? 65 : 50;

  if (matchedSpec) {
    confidenceScore = fipeVerified ? 100 : 95;
    status = 'VERIFIED';

    if (
      input.year < matchedSpec.yearStart - 1 ||
      input.year > matchedSpec.yearEnd + 1
    ) {
      warnings.push(
        `O ano ${input.year} está fora da geração catalogada (${matchedSpec.yearStart}–${matchedSpec.yearEnd}) para ${matchedSpec.brand} ${matchedSpec.model}.`
      );
      confidenceScore -= 10;
      status = 'ADJUSTED_WARNING';
    }

    const tankDiffRatio =
      Math.abs(input.tankCapacityLiters - matchedSpec.tankCapacityLiters) /
      matchedSpec.tankCapacityLiters;

    if (tankDiffRatio > 0.1) {
      warnings.push(
        `Tanque informado (${input.tankCapacityLiters} L) diverge em ${(
          tankDiffRatio * 100
        ).toFixed(0)}% da ficha oficial (${matchedSpec.tankCapacityLiters} L).`
      );
      confidenceScore -= 20;
      status = 'ADJUSTED_WARNING';
    } else {
      autoFilledFields.push('tankCapacityLiters');
    }

    if (input.gaugeSegments !== matchedSpec.gaugeSegments) {
      warnings.push(
        `Marcador informado (${input.gaugeSegments} palitinhos) difere do padrão catalogado (${matchedSpec.gaugeSegments} palitinhos). Verifique no painel.`
      );
      confidenceScore -= 15;
      status = 'ADJUSTED_WARNING';
    } else {
      autoFilledFields.push('gaugeSegments');
    }

    if (
      input.inmetroCityGasolineKmL &&
      Math.abs(input.inmetroCityGasolineKmL - matchedSpec.inmetroCityGasolineKmL) /
        matchedSpec.inmetroCityGasolineKmL >
        0.25
    ) {
      warnings.push(
        `Média INMETRO Gasolina informada (${input.inmetroCityGasolineKmL} km/L) está distante da referência oficial (${matchedSpec.inmetroCityGasolineKmL} km/L).`
      );
      confidenceScore -= 10;
      status = 'ADJUSTED_WARNING';
    }
  } else {
    warnings.push(
      'Modelo não encontrado no catálogo técnico local. Confira manualmente a capacidade do tanque (L) e o número de palitinhos do painel.'
    );
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  return {
    isValid: errors.length === 0,
    status,
    confidenceScore,
    matchedSpec,
    fipeVerified,
    warnings,
    errors,
    autoFilledFields,
  };
}

/**
 * Constrói um objeto Vehicle preenchido e validado a partir de uma especificação oficial.
 */
export function buildVehicleFromInput(
  input: VehicleRegistrationInput,
  validation: CrossValidationResult,
  id?: string
): Vehicle {
  const spec = validation.matchedSpec;
  return {
    id: id ?? `veh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    nickname:
      input.nickname?.trim() || `${input.brand.trim()} ${input.model.trim()}`,
    brand: input.brand.trim(),
    model: input.model.trim(),
    year: input.year,
    fipeCode: input.fipeCode,
    specId: spec?.id,
    tankCapacityLiters: input.tankCapacityLiters,
    gaugeSegments: input.gaugeSegments,
    reserveLiters:
      input.reserveLiters ??
      spec?.reserveLiters ??
      Math.round(input.tankCapacityLiters * 0.12 * 10) / 10,
    reserveOffsetLiters: input.reserveOffsetLiters ?? spec?.reserveOffsetLiters ?? 0,
    inmetroCityGasolineKmL:
      input.inmetroCityGasolineKmL ?? spec?.inmetroCityGasolineKmL,
    inmetroHighwayGasolineKmL:
      input.inmetroHighwayGasolineKmL ?? spec?.inmetroHighwayGasolineKmL,
    inmetroCityEthanolKmL:
      input.inmetroCityEthanolKmL ?? spec?.inmetroCityEthanolKmL,
    inmetroHighwayEthanolKmL:
      input.inmetroHighwayEthanolKmL ?? spec?.inmetroHighwayEthanolKmL,
    validationStatus: validation.status,
    validationScore: validation.confidenceScore,
    createdAt: new Date().toISOString(),
  };
}

export function clearFipeCacheForTests(): void {
  cachedBrands = null;
  cachedModelsByBrand.clear();
}
