import { describe, expect, it } from 'vitest';
import {
  clearFipeCacheForTests,
  crossValidateVehicleRegistration,
  extractYearFromQuery,
  findBestSpecMatch,
  lookupVehicleSpecs,
  verifyVehicleInFipe,
} from '../src/services/vehicleValidator';

describe('vehicleValidator (Validação Cruzada no Cadastro)', () => {
  it('busca veículos na base técnica pública por texto livre', () => {
    const results = lookupVehicleSpecs('polo tsi');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].brand).toBe('Volkswagen');
    expect(results[0].tankCapacityLiters).toBe(52);
    expect(results[0].gaugeSegments).toBe(8);
  });

  it('encontra correspondência oficial exata por marca, modelo e ano', () => {
    const onix = findBestSpecMatch('Chevrolet', 'Onix 1.0 Turbo', 2023);
    expect(onix).not.toBeNull();
    expect(onix?.tankCapacityLiters).toBe(44);
    expect(onix?.gaugeSegments).toBe(8);

    const hb20 = findBestSpecMatch('Hyundai', 'HB20 1.0', 2022);
    expect(hb20).not.toBeNull();
    expect(hb20?.tankCapacityLiters).toBe(50);
    expect(hb20?.gaugeSegments).toBe(12);
  });

  it('aprova cadastro quando tanque e palitinhos batem com a base pública', () => {
    const result = crossValidateVehicleRegistration({
      brand: 'Fiat',
      model: 'Argo 1.0',
      year: 2022,
      tankCapacityLiters: 48,
      gaugeSegments: 16,
    });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(95);
    expect(result.warnings).toHaveLength(0);
    expect(result.matchedSpec?.id).toBe('fiat-argo-10');
  });

  it('emite alerta de validação cruzada quando tanque ou palitinhos divergem da base', () => {
    const result = crossValidateVehicleRegistration({
      brand: 'Volkswagen',
      model: 'Polo 1.0 TSI',
      year: 2023,
      tankCapacityLiters: 65, // oficial: 52L (> 10% de divergência)
      gaugeSegments: 12, // oficial: 8 palitinhos
    });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('ADJUSTED_WARNING');
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.confidenceScore).toBeLessThan(80);
  });

  it('bloqueia valores fisicamente impossíveis no cadastro', () => {
    const result = crossValidateVehicleRegistration({
      brand: '',
      model: 'Teste',
      year: 2023,
      tankCapacityLiters: 5,
      gaugeSegments: 2,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('marca veículo fora da base como UNVERIFIED_CUSTOM com aviso orientativo', () => {
    const result = crossValidateVehicleRegistration({
      brand: 'Gurgel',
      model: 'BR-800',
      year: 1991,
      tankCapacityLiters: 40,
      gaugeSegments: 8,
    });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('UNVERIFIED_CUSTOM');
    expect(result.matchedSpec).toBeNull();
    expect(result.warnings.length).toBe(1);
  });

  it('verifica modelo na API FIPE com mock de rede e fallback seguro em caso de falha', async () => {
    clearFipeCacheForTests();
    const mockFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/marcas')) {
        return new Response(
          JSON.stringify([{ codigo: '59', nome: 'VW - VolksWagen' }]),
          { status: 200 }
        );
      }
      if (url.includes('/marcas/59/modelos')) {
        return new Response(
          JSON.stringify({
            modelos: [{ codigo: 8123, nome: 'Polo 1.0 TSI Flex 12V 5p' }],
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const ok = await verifyVehicleInFipe('VolksWagen', 'Polo 1.0 TSI', mockFetch);
    expect(ok.verified).toBe(true);
    expect(ok.fipeBrand?.codigo).toBe('59');

    clearFipeCacheForTests();
    const failingFetch: typeof fetch = (async () => {
      throw new Error('Network offline');
    }) as typeof fetch;

    const offline = await verifyVehicleInFipe('Volkswagen', 'Polo', failingFetch);
    expect(offline.verified).toBe(false);
  });

  it('encontra e valida carros populares brasileiros clássicos incluindo Palio ELX 2010 1.0 com 16 palitinhos', () => {
    expect(extractYearFromQuery('palio elx 2010 1.0')).toBe(2010);

    const palio = lookupVehicleSpecs('palio elx 2010 1.0');
    expect(palio.length).toBeGreaterThan(0);
    expect(palio[0].id).toBe('fiat-palio-10-elx');
    expect(palio[0].tankCapacityLiters).toBe(48);
    expect(palio[0].gaugeSegments).toBe(16);

    const palioValidation = crossValidateVehicleRegistration({
      brand: 'Fiat',
      model: 'Palio ELX 1.0',
      year: 2010,
      tankCapacityLiters: 48,
      gaugeSegments: 16,
    });
    expect(palioValidation.isValid).toBe(true);
    expect(palioValidation.status).toBe('VERIFIED');
    expect(palioValidation.matchedSpec?.id).toBe('fiat-palio-10-elx');

    // Também aceita subdivisão analógica alternativa (ex: 8 divisões) sem penalidade
    const palioAltGauge = crossValidateVehicleRegistration({
      brand: 'Fiat',
      model: 'Palio ELX 1.0',
      year: 2010,
      tankCapacityLiters: 48,
      gaugeSegments: 8,
    });
    expect(palioAltGauge.status).toBe('VERIFIED');

    expect(lookupVehicleSpecs('palio fire 1.0')[0].id).toBe('fiat-palio-10-fire');
    expect(lookupVehicleSpecs('celta 1.0')[0].brand).toBe('Chevrolet');
    expect(lookupVehicleSpecs('gol g5')[0].id).toBe('vw-gol-g5-g8');
    expect(lookupVehicleSpecs('uno mille')[0].id).toBe('fiat-uno-mille-fire');
    expect(lookupVehicleSpecs('corsa classic')[0].id).toBe('chevrolet-corsa-classic-wind');
    expect(lookupVehicleSpecs('new civic')[0].id).toBe('honda-civic-g8-g9');
  });
});
