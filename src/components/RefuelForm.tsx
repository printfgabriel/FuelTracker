import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_FUEL_TYPE,
  FUEL_LABELS,
  FuelType,
  RefuelEntry,
  Vehicle,
} from '../types';
import {
  calculateLiters,
  calculateTotalCost,
  estimateTankVolumeFromBars,
  getGaugeStepLiters,
  roundTo,
} from '../services/fuelCalculator';
import { CloseIcon, FuelPumpIcon, GaugeIcon } from './Icons';

interface RefuelFormProps {
  vehicle: Vehicle | null;
  lastOdometerKm: number | null;
  lastPrices: Partial<Record<FuelType, number>>;
  onAddEntry: (entry: Omit<RefuelEntry, 'id'>) => void;
  onGoToVehicles: () => void;
  onClose: () => void;
}

function getLocalDateTimeValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const RefuelForm: React.FC<RefuelFormProps> = ({
  vehicle,
  lastOdometerKm,
  lastPrices,
  onAddEntry,
  onGoToVehicles,
  onClose,
}) => {
  const [fuelType, setFuelType] = useState<FuelType>(DEFAULT_FUEL_TYPE);
  const [priceStr, setPriceStr] = useState<string>(
    lastPrices[DEFAULT_FUEL_TYPE] ? lastPrices[DEFAULT_FUEL_TYPE]!.toFixed(2) : '6.09'
  );
  const [totalStr, setTotalStr] = useState<string>('');
  const [litersStr, setLitersStr] = useState<string>('');
  const [odometerStr, setOdometerStr] = useState<string>(
    lastOdometerKm ? String(lastOdometerKm + 320) : ''
  );
  const [barsBefore, setBarsBefore] = useState<number>(2);
  const [fullTank, setFullTank] = useState<boolean>(false);
  const [dateStr, setDateStr] = useState<string>(getLocalDateTimeValue);
  const [station, setStation] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (vehicle) {
      setBarsBefore((prev) => Math.min(prev, vehicle.gaugeSegments));
    }
  }, [vehicle]);

  useEffect(() => {
    const knownPrice = lastPrices[fuelType];
    if (knownPrice && knownPrice > 0) {
      setPriceStr(knownPrice.toFixed(2));
      const totalVal = parseFloat(totalStr.replace(',', '.'));
      if (Number.isFinite(totalVal) && totalVal > 0) {
        const calcL = calculateLiters(totalVal, knownPrice);
        setLitersStr(calcL > 0 ? String(calcL) : '');
      }
    } else if (fuelType === 'ETHANOL' && priceStr === '6.09') {
      setPriceStr('4.09');
    } else if (fuelType === 'GASOLINE' && priceStr === '4.09') {
      setPriceStr('6.09');
    }
  }, [fuelType]);

  const handlePriceChange = (raw: string) => {
    setPriceStr(raw);
    const price = parseFloat(raw.replace(',', '.'));
    const total = parseFloat(totalStr.replace(',', '.'));
    if (Number.isFinite(price) && price > 0 && Number.isFinite(total) && total > 0) {
      const l = calculateLiters(total, price);
      setLitersStr(l > 0 ? String(l) : '');
    }
  };

  const handleTotalChange = (raw: string) => {
    setTotalStr(raw);
    const price = parseFloat(priceStr.replace(',', '.'));
    const total = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(price) && price > 0 && Number.isFinite(total) && total > 0) {
      const l = calculateLiters(total, price);
      setLitersStr(l > 0 ? String(l) : '');
    } else {
      setLitersStr('');
    }
  };

  const handleLitersChange = (raw: string) => {
    setLitersStr(raw);
    const price = parseFloat(priceStr.replace(',', '.'));
    const liters = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(price) && price > 0 && Number.isFinite(liters) && liters > 0) {
      const total = calculateTotalCost(liters, price);
      setTotalStr(total > 0 ? total.toFixed(2) : '');
    }
  };

  const tankPreview = useMemo(() => {
    if (!vehicle) return null;
    const beforeL = estimateTankVolumeFromBars(barsBefore, vehicle);
    const liters = parseFloat(litersStr.replace(',', '.')) || 0;
    const afterL = fullTank
      ? vehicle.tankCapacityLiters
      : roundTo(Math.min(vehicle.tankCapacityLiters, beforeL + liters), 2);
    const stepL = roundTo(getGaugeStepLiters(vehicle), 2);
    const barsAfterApprox = Math.min(
      vehicle.gaugeSegments,
      Math.round((afterL / vehicle.tankCapacityLiters) * vehicle.gaugeSegments)
    );
    return { beforeL, afterL, stepL, barsAfterApprox };
  }, [vehicle, barsBefore, litersStr, fullTank]);

  if (!vehicle) {
    return (
      <div
        className="sheet-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <section className="sheet-panel" role="dialog" aria-modal="true" aria-label="Novo Abastecimento">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div>
              <h2>Novo Abastecimento</h2>
              <span className="subtitle">Nenhum veículo selecionado</span>
            </div>
            <button type="button" className="icon-close-btn" onClick={onClose} aria-label="Fechar">
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="empty-state">
            <p>
              Cadastre seu carro na Garagem primeiro para ativar a validação cruzada do
              tanque e o cálculo por palitinhos.
            </p>
            <button
              type="button"
              className="btn-primary btn-block"
              onClick={() => {
                onClose();
                onGoToVehicles();
              }}
            >
              Cadastrar meu carro
            </button>
          </div>
        </section>
      </div>
    );
  }

  const priceNum = parseFloat(priceStr.replace(',', '.'));
  const totalNum = parseFloat(totalStr.replace(',', '.'));
  const litersNum = parseFloat(litersStr.replace(',', '.'));
  const odoNum = parseFloat(odometerStr.replace(',', '.'));
  const isOdometerLower =
    lastOdometerKm !== null && Number.isFinite(odoNum) && odoNum <= lastOdometerKm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErrorMsg('Informe um preço por litro válido.');
      return;
    }
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setErrorMsg('Informe o valor total pago.');
      return;
    }
    if (!Number.isFinite(odoNum) || odoNum <= 0) {
      setErrorMsg('Informe o odômetro atual (km).');
      return;
    }

    const computedLiters =
      Number.isFinite(litersNum) && litersNum > 0
        ? roundTo(litersNum, 3)
        : calculateLiters(totalNum, priceNum);

    onAddEntry({
      vehicleId: vehicle.id,
      date: dateStr,
      odometerKm: odoNum,
      fuelType,
      pricePerLiter: roundTo(priceNum, 3),
      totalCost: roundTo(totalNum, 2),
      liters: computedLiters,
      barsBefore,
      fullTank,
      station: station.trim() || undefined,
    });

    onClose();
  };

  const segmentsArray = Array.from(
    { length: vehicle.gaugeSegments },
    (_, idx) => idx + 1
  );

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="sheet-panel form-card"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Novo Abastecimento"
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title-wrap">
            <span className="sheet-icon-badge">
              <FuelPumpIcon size={18} />
            </span>
            <div>
              <h2>Novo Abastecimento</h2>
              <span className="subtitle">
                {vehicle.nickname} · {vehicle.tankCapacityLiters} L ({vehicle.gaugeSegments} palitinhos)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Fechar tela de abastecimento"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="field-group">
          <label>Combustível (Gasolina é padrão)</label>
          <div className="segmented-control" role="radiogroup" aria-label="Combustível">
            <button
              type="button"
              className={`seg-btn ${fuelType === 'GASOLINE' ? 'active-gas' : ''}`}
              onClick={() => setFuelType('GASOLINE')}
            >
              Gasolina
            </button>
            <button
              type="button"
              className={`seg-btn ${fuelType === 'ETHANOL' ? 'active-eth' : ''}`}
              onClick={() => setFuelType('ETHANOL')}
            >
              Álcool (Etanol)
            </button>
          </div>
        </div>

        <div className="pump-display">
          <div className="pump-cell">
            <label htmlFor="price-per-liter">Preço / L (R$)</label>
            <input
              id="price-per-liter"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0.1"
              placeholder="6.09"
              value={priceStr}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="num-input"
              required
            />
          </div>

          <div className="pump-cell">
            <label htmlFor="total-cost">Total Pago (R$)</label>
            <input
              id="total-cost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              placeholder="150.00"
              value={totalStr}
              onChange={(e) => handleTotalChange(e.target.value)}
              className="num-input"
              autoFocus
              required
            />
          </div>

          <div className="pump-cell pump-cell-liters">
            <label htmlFor="liters-auto">Litros (Auto)</label>
            <input
              id="liters-auto"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0.1"
              placeholder="0.000"
              value={litersStr}
              onChange={(e) => handleLitersChange(e.target.value)}
              className="num-input input-highlight"
            />
          </div>
        </div>

        <div className="gauge-cluster">
          <div className="gauge-header">
            <label className="gauge-title-label">
              <GaugeIcon size={16} />
              <span>Palitinhos antes de abastecer</span>
            </label>
            <span className="pill-accent tabular">
              {barsBefore} / {vehicle.gaugeSegments}
            </span>
          </div>

          <div className="gauge-shortcuts" role="group" aria-label="Atalhos de nível do tanque">
            {[
              { label: 'Reserva', value: Math.max(1, Math.round(vehicle.gaugeSegments * 0.12)) },
              { label: '1/4', value: Math.round(vehicle.gaugeSegments * 0.25) },
              { label: '1/2', value: Math.round(vehicle.gaugeSegments * 0.5) },
              { label: '3/4', value: Math.round(vehicle.gaugeSegments * 0.75) },
              { label: 'Cheio', value: vehicle.gaugeSegments },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`gauge-shortcut-btn ${
                  barsBefore === preset.value ? 'active' : ''
                }`}
                onClick={() => setBarsBefore(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="gauge-instrument-row">
            <button
              type="button"
              className={`gauge-e-btn ${barsBefore === 0 ? 'selected' : ''}`}
              onClick={() => setBarsBefore(0)}
              title="0 palitinhos (Reserva)"
            >
              E (0)
            </button>

            <div className="gauge-bars" role="group" aria-label="Palitinhos do marcador">
              {segmentsArray.map((barIdx) => {
                const lit = barIdx <= barsBefore;
                const isReserve =
                  barIdx <= Math.max(1, Math.round(vehicle.gaugeSegments * 0.15));
                return (
                  <button
                    key={barIdx}
                    type="button"
                    className={`gauge-bar ${
                      lit ? (isReserve ? 'lit-reserve' : 'lit') : ''
                    }`}
                    onClick={() => setBarsBefore(barIdx)}
                    aria-label={`${barIdx} palitinhos`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className={`gauge-f-btn ${
                barsBefore === vehicle.gaugeSegments ? 'selected' : ''
              }`}
              onClick={() => setBarsBefore(vehicle.gaugeSegments)}
              title="Tanque cheio"
            >
              F
            </button>
          </div>

          {tankPreview && (
            <div className="gauge-readout">
              <span className="muted-sm tabular">
                Antes: <strong>~{tankPreview.beforeL.toFixed(1)} L</strong> (~
                {tankPreview.stepL} L/palitinho)
              </span>
              <span className="muted-sm tabular">
                Após: <strong>{tankPreview.afterL.toFixed(1)} L</strong> (~
                {tankPreview.barsAfterApprox} pal.)
              </span>
            </div>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={fullTank}
              onChange={(e) => setFullTank(e.target.checked)}
            />
            <span>Completei o tanque até o automático da bomba</span>
          </label>
        </div>

        <div className="grid-2">
          <div className="field-group">
            <label htmlFor="odometer">
              Odômetro (km){' '}
              {lastOdometerKm !== null && (
                <span className="muted-sm tabular">(ant: {lastOdometerKm})</span>
              )}
            </label>
            <input
              id="odometer"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={odometerStr}
              onChange={(e) => setOdometerStr(e.target.value)}
              className="tabular"
              required
            />
            {isOdometerLower && (
              <span className="warn-inline">
                Menor ou igual ao último registro ({lastOdometerKm} km).
              </span>
            )}
          </div>

          <div className="field-group">
            <label htmlFor="refuel-date">Data e Hora</label>
            <input
              id="refuel-date"
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="station">Posto / Observação (opcional)</label>
          <input
            id="station"
            type="text"
            placeholder="Ex: Posto Ipiranga Centro"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          />
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <div className="sheet-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar {FUEL_LABELS[fuelType].split(' ')[0]}
          </button>
        </div>
      </form>
    </div>
  );
};
