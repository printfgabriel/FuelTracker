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
            const fuelShort = FUEL_LABELS[entry.fuelType].split(' ')[0];
            const intervalFuelShort = interval
              ? FUEL_LABELS[interval.fuelType].split(' ')[0]
              : fuelShort;

            return (
              <div key={entry.id} className="history-item history-row">
                <div className="history-col-left">
                  <div className="inline-icon-row">
                    <span
                      className={`badge ${
                        entry.fuelType === 'GASOLINE' ? 'badge-gas' : 'badge-eth'
                      }`}
                    >
                      {fuelShort}
                    </span>
                    <span className="muted-sm tabular">
                      {new Date(entry.date).toLocaleDateString('pt-BR')}
                    </span>
                    {interval?.isMixedTank && (
                      <span className="badge badge-warn">Misto</span>
                    )}
                  </div>
                  <div className="history-amount tabular">
                    <strong>R$ {entry.totalCost.toFixed(2)}</strong>
                    <span className="muted-sm"> · {entry.liters.toFixed(1)} L</span>
                  </div>
                </div>

                <div className="history-col-right">
                  {interval ? (
                    interval.isValid ? (
                      <div className="history-kpi">
                        <strong className="history-kml tabular">
                          {interval.kmPerLiter.toFixed(1)} km/L
                        </strong>
                        <span className="muted-sm tabular">
                          +{interval.distanceKm.toFixed(0)} km
                          {interval.fuelType !== entry.fuelType
                            ? ` (${intervalFuelShort})`
                            : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="history-kpi">
                        <span className="warn-inline">Trecho inválido</span>
                      </div>
                    )
                  ) : (
                    <div className="history-kpi">
                      <strong className="history-odo tabular">
                        {entry.odometerKm.toLocaleString('pt-BR')} km
                      </strong>
                      <span className="muted-sm">Início</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="icon-delete-btn"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label="Excluir abastecimento"
                    title="Excluir abastecimento"
                  >
                    <TrashIcon size={15} />
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
