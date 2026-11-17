import React from 'react';
import {
  ConsumptionInterval,
  FUEL_LABELS,
  RefuelEntry,
  Vehicle,
} from '../types';
import { sortEntriesChronologically } from '../services/fuelCalculator';
import { HistoryIcon, TrashIcon } from './Icons';

interface HistoryListProps {
  vehicle: Vehicle | null;
  entries: RefuelEntry[];
  intervals: ConsumptionInterval[];
  onDeleteEntry: (entryId: string) => void;
  title?: string;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  vehicle,
  entries,
  intervals,
  onDeleteEntry,
  title = 'Histórico de Abastecimentos',
}) => {
  if (!vehicle) {
    return null;
  }

  const orderedDesc = sortEntriesChronologically(
    entries.filter((e) => e.vehicleId === vehicle.id)
  ).reverse();

  const intervalByToEntry = new Map<string, ConsumptionInterval>();
  for (const interval of intervals) {
    intervalByToEntry.set(interval.toEntryId, interval);
  }

  return (
    <section className="card">
      <div className="card-header">
        <div className="inline-icon-row">
          <HistoryIcon size={18} />
          <div>
            <h2>{title}</h2>
            <span className="subtitle tabular">
              {vehicle.nickname} · {orderedDesc.length} registro(s)
            </span>
          </div>
        </div>
      </div>

      {orderedDesc.length === 0 ? (
        <p className="muted-sm">
          Nenhum abastecimento registrado ainda. Toque em "+ Abastecer" abaixo para começar.
        </p>
      ) : (
        <div className="history-list">
          {orderedDesc.map((entry) => {
            const interval = intervalByToEntry.get(entry.id);
            return (
              <div key={entry.id} className="history-item">
                <div className="history-top">
                  <div className="inline-icon-row">
                    <span
                      className={`badge ${
                        entry.fuelType === 'GASOLINE' ? 'badge-gas' : 'badge-eth'
                      }`}
                    >
                      {FUEL_LABELS[entry.fuelType]}
                    </span>
                    <strong className="tabular">
                      {entry.odometerKm.toLocaleString('pt-BR')} km
                    </strong>
                  </div>
                  <span className="muted-sm tabular">
                    {new Date(entry.date).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div className="history-mid tabular">
                  <span>
                    {entry.liters.toFixed(2)} L × R$ {entry.pricePerLiter.toFixed(2)} ={' '}
                    <strong>R$ {entry.totalCost.toFixed(2)}</strong>
                  </span>
                  <span className="muted-sm">
                    {entry.barsBefore}/{vehicle.gaugeSegments} palitinhos
                    {entry.fullTank ? ' · Tanque cheio' : ''}
                  </span>
                </div>

                {interval && (
                  <div className="history-interval">
                    {interval.isValid ? (
                      <>
                        <span className="tabular">
                          Trecho ({FUEL_LABELS[interval.fuelType].split(' ')[0]}):{' '}
                          <strong>{interval.kmPerLiter.toFixed(2)} km/L</strong>{' '}
                          <span className="muted-sm">
                            ({interval.kmPerLiterMin.toFixed(1)}–
                            {interval.kmPerLiterMax.toFixed(1)} · {interval.distanceKm} km /{' '}
                            {interval.fuelConsumedLiters.toFixed(1)} L)
                          </span>
                        </span>
                        {interval.isMixedTank && (
                          <span className="badge badge-warn tabular">
                            Misto ({Math.round(interval.residualOtherFuelRatio * 100)}%)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="warn-inline">{interval.invalidReason}</span>
                    )}
                  </div>
                )}

                <div className="history-actions">
                  <span className="muted-sm">{entry.station || ''}</span>
                  <button
                    type="button"
                    className="btn-ghost-danger inline-icon-row"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label="Excluir abastecimento"
                  >
                    <TrashIcon size={14} />
                    <span>Excluir</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
