import React, { useMemo, useState } from 'react';
import {
  ConsumptionInterval,
  FUEL_LABELS,
  FuelComparisonResult,
  FuelStatsSummary,
  FuelType,
  MonthlySpendBucket,
  Vehicle,
} from '../types';
import { AlertIcon, ChartIcon } from './Icons';

interface AnalyticsDashboardProps {
  vehicle: Vehicle | null;
  intervals: ConsumptionInterval[];
  comparison: FuelComparisonResult;
  monthlySpending: MonthlySpendBucket[];
}

function getRatingBadgeClass(rating: FuelStatsSummary['latestRating']): string {
  switch (rating) {
    case 'EXCELENTE':
      return 'badge-excellent';
    case 'BOM':
      return 'badge-ok';
    case 'NORMAL':
      return 'badge-neutral';
    case 'ATENÇÃO':
      return 'badge-warn';
    case 'CRÍTICO':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

const ConsumptionControlChart: React.FC<{
  intervals: ConsumptionInterval[];
  stats: FuelStatsSummary;
}> = ({ intervals, stats }) => {
  if (intervals.length === 0) {
    return (
      <div className="chart-empty">
        Sem intervalos puros suficientes de {FUEL_LABELS[stats.fuelType]} para plotar.
      </div>
    );
  }

  const width = 400;
  const height = 185;
  const padL = 36;
  const padR = 14;
  const padT = 20;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = intervals.map((i) => i.kmPerLiter);
  const refs = [
    ...values,
    stats.weightedKmPerLiter,
    stats.controlLowerKmPerLiter ?? stats.weightedKmPerLiter,
    stats.inmetroRefKmL ?? stats.weightedKmPerLiter,
  ].filter((v) => v > 0);

  const minVal = Math.max(2, Math.floor(Math.min(...refs) - 1.2));
  const maxVal = Math.ceil(Math.max(...refs) + 1.2);
  const span = Math.max(1, maxVal - minVal);

  const xPos = (idx: number) =>
    intervals.length === 1
      ? padL + innerW / 2
      : padL + (idx / (intervals.length - 1)) * innerW;
  const yPos = (val: number) =>
    padT + ((maxVal - val) / span) * innerH;

  const points = intervals.map((it, idx) => ({
    x: xPos(idx),
    y: yPos(it.kmPerLiter),
    val: it.kmPerLiter,
    date: it.toDate.slice(5, 10),
  }));

  const pathD = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const strokeColor =
    stats.fuelType === 'GASOLINE' ? 'var(--gas)' : 'var(--eth)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="svg-chart"
      role="img"
      aria-label={`Gráfico de consumo ${FUEL_LABELS[stats.fuelType]}`}
    >
      {[minVal, (minVal + maxVal) / 2, maxVal].map((tick, idx) => {
        const y = yPos(tick);
        return (
          <g key={idx}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text x={padL - 6} y={y + 3.5} textAnchor="end" className="chart-axis">
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {stats.weightedKmPerLiter > 0 && (
        <line
          x1={padL}
          y1={yPos(stats.weightedKmPerLiter)}
          x2={width - padR}
          y2={yPos(stats.weightedKmPerLiter)}
          stroke="var(--muted)"
          strokeDasharray="5 4"
          strokeWidth="1.4"
        />
      )}

      {stats.controlLowerKmPerLiter && (
        <line
          x1={padL}
          y1={yPos(stats.controlLowerKmPerLiter)}
          x2={width - padR}
          y2={yPos(stats.controlLowerKmPerLiter)}
          stroke="var(--danger)"
          strokeDasharray="4 4"
          strokeWidth="1.4"
        />
      )}

      {stats.inmetroRefKmL && (
        <line
          x1={padL}
          y1={yPos(stats.inmetroRefKmL)}
          x2={width - padR}
          y2={yPos(stats.inmetroRefKmL)}
          stroke="var(--warn)"
          strokeDasharray="2 4"
          strokeWidth="1.4"
        />
      )}

      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, idx) => {
        const isAlertPoint =
          stats.controlLowerKmPerLiter !== null &&
          p.val <= stats.controlLowerKmPerLiter;
        return (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={idx === points.length - 1 ? 5 : 3.8}
              fill={isAlertPoint ? 'var(--danger)' : strokeColor}
              stroke="var(--surface)"
              strokeWidth="1.6"
            />
            <text x={p.x} y={p.y - 9} textAnchor="middle" className="chart-val">
              {p.val.toFixed(1)}
            </text>
            <text x={p.x} y={height - 6} textAnchor="middle" className="chart-axis">
              {p.date}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const MonthlySpendingChart: React.FC<{ buckets: MonthlySpendBucket[] }> = ({
  buckets,
}) => {
  if (buckets.length === 0) {
    return <div className="chart-empty">Sem gastos registrados ainda.</div>;
  }

  const recent = buckets.slice(-6);
  const maxTotal = Math.max(1, ...recent.map((b) => b.totalCost));
  const width = 400;
  const height = 175;
  const padL = 16;
  const padR = 16;
  const padT = 24;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const slotW = innerW / recent.length;
  const barW = Math.min(34, slotW * 0.58);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="svg-chart"
      role="img"
      aria-label="Gráfico de gastos mensais"
    >
      {recent.map((b, idx) => {
        const x = padL + idx * slotW + (slotW - barW) / 2;
        const gasH = (b.gasolineCost / maxTotal) * innerH;
        const ethH = (b.ethanolCost / maxTotal) * innerH;
        const totalH = gasH + ethH;
        const topY = padT + innerH - totalH;
        return (
          <g key={b.monthKey}>
            {b.ethanolCost > 0 && (
              <rect
                x={x}
                y={topY}
                width={barW}
                height={ethH}
                rx="3"
                fill="var(--eth)"
              />
            )}
            {b.gasolineCost > 0 && (
              <rect
                x={x}
                y={topY + ethH}
                width={barW}
                height={gasH}
                rx="3"
                fill="var(--gas)"
              />
            )}
            <text
              x={x + barW / 2}
              y={topY - 6}
              textAnchor="middle"
              className="chart-val"
            >
              R${Math.round(b.totalCost)}
            </text>
            <text
              x={x + barW / 2}
              y={height - 6}
              textAnchor="middle"
              className="chart-axis"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  vehicle,
  intervals,
  comparison,
  monthlySpending,
}) => {
  const [selectedFuel, setSelectedFuel] = useState<FuelType>('GASOLINE');

  const activeStats =
    selectedFuel === 'GASOLINE'
      ? comparison.gasolineStats
      : comparison.ethanolStats;

  const activeIntervals = useMemo(
    () =>
      intervals.filter(
        (item) =>
          item.isValid &&
          !item.isMixedTank &&
          item.fuelType === selectedFuel
      ),
    [intervals, selectedFuel]
  );

  const allAlerts = useMemo(
    () => [...comparison.gasolineStats.alerts, ...comparison.ethanolStats.alerts],
    [comparison]
  );

  const latestMonth = monthlySpending[monthlySpending.length - 1];

  if (!vehicle) {
    return (
      <section className="card empty-state">
        <ChartIcon size={28} />
        <h2>Análises Estatísticas</h2>
        <p>Cadastre um veículo na Garagem e adicione abastecimentos para visualizar as análises.</p>
      </section>
    );
  }

  return (
    <div className="stack-gap">
      {allAlerts.length > 0 && (
        <section className="alert-stack" aria-label="Mini-alertas estatísticos">
          {allAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`mini-alert ${
                alert.severity === 'critical' ? 'mini-alert-critical' : 'mini-alert-warn'
              }`}
            >
              <div className="mini-alert-title">
                <span className="inline-icon-row">
                  <AlertIcon size={16} />
                  <span>{alert.title}</span>
                </span>
                <span className="pill-stat tabular">
                  +{alert.percentIncreaseInConsumption.toFixed(1)}% gasto · p=
                  {alert.pValue.toFixed(4)}
                </span>
              </div>
              <p>{alert.message}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Avaliação Estatística</h2>
            <span className="subtitle">
              Gasolina e Álcool analisados em séries puras separadas
            </span>
          </div>
          <div className="segmented-control compact">
            <button
              type="button"
              className={`seg-btn ${selectedFuel === 'GASOLINE' ? 'active-gas' : ''}`}
              onClick={() => setSelectedFuel('GASOLINE')}
            >
              Gasolina ({comparison.gasolineStats.intervalCount})
            </button>
            <button
              type="button"
              className={`seg-btn ${selectedFuel === 'ETHANOL' ? 'active-eth' : ''}`}
              onClick={() => setSelectedFuel('ETHANOL')}
            >
              Álcool ({comparison.ethanolStats.intervalCount})
            </button>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-box">
            <span className="kpi-label">Média Ponderada</span>
            <strong className="kpi-value tabular">
              {activeStats.weightedKmPerLiter > 0
                ? `${activeStats.weightedKmPerLiter.toFixed(2)} km/L`
                : '—'}
            </strong>
            <span className="muted-sm tabular">
              {activeStats.totalDistanceKm.toFixed(0)} km analisados
            </span>
          </div>

          <div className="kpi-box">
            <span className="kpi-label">Último Trecho</span>
            <strong className="kpi-value tabular">
              {activeStats.latestKmPerLiter !== null
                ? `${activeStats.latestKmPerLiter.toFixed(2)} km/L`
                : '—'}
            </strong>
            <span className={`badge ${getRatingBadgeClass(activeStats.latestRating)}`}>
              {activeStats.latestRating}
            </span>
          </div>

          <div className="kpi-box">
            <span className="kpi-label">Tendência EWMA</span>
            <strong className="kpi-value tabular">
              {activeStats.ewmaKmPerLiter > 0
                ? `${activeStats.ewmaKmPerLiter.toFixed(2)} km/L`
                : '—'}
            </strong>
            <span className="muted-sm tabular">
              {activeStats.latestZScore !== null
                ? `z=${activeStats.latestZScore >= 0 ? '+' : ''}${activeStats.latestZScore.toFixed(
                    2
                  )} | p=${activeStats.latestPValue?.toFixed(3)}`
                : 'Aguardando base'}
            </span>
          </div>

          <div className="kpi-box">
            <span className="kpi-label">Custo Médio / km</span>
            <strong className="kpi-value tabular">
              {activeStats.avgCostPerKm !== null
                ? `R$ ${activeStats.avgCostPerKm.toFixed(3)}`
                : '—'}
            </strong>
            <span className="muted-sm tabular">
              {activeStats.inmetroRefKmL
                ? `INMETRO: ${activeStats.inmetroRefKmL.toFixed(1)} km/L`
                : 'Sem ref. INMETRO'}
            </span>
          </div>
        </div>

        <p className="rating-note">{activeStats.ratingSummary}</p>

        <ConsumptionControlChart intervals={activeIntervals} stats={activeStats} />

        <div className="chart-legend">
          <span>
            <i
              className="dot"
              style={{
                background:
                  selectedFuel === 'GASOLINE' ? 'var(--gas)' : 'var(--eth)',
              }}
            />
            Consumo (km/L)
          </span>
          <span>
            <i className="dot dot-gray" /> Média histórica
          </span>
          <span>
            <i className="dot dot-red" /> Limite alerta (p &lt; 0,05)
          </span>
          <span>
            <i className="dot dot-yellow" /> INMETRO
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Comparativo: Gasolina vs. Álcool</h2>
        <div className="verdict-banner">
          <strong>Recomendação: </strong>
          <span>{comparison.verdict}</span>
        </div>
        <div className="compare-grid">
          <div className="compare-col compare-gas">
            <h3>Gasolina</h3>
            <div className="tabular">
              Média real:{' '}
              {comparison.gasolineStats.weightedKmPerLiter
                ? `${comparison.gasolineStats.weightedKmPerLiter.toFixed(2)} km/L`
                : '—'}
            </div>
            <div className="tabular">
              Custo/km:{' '}
              {comparison.gasolineCostPerKm !== null
                ? `R$ ${comparison.gasolineCostPerKm.toFixed(3)}/km`
                : '—'}
            </div>
            <div className="tabular">
              Último preço:{' '}
              {comparison.latestGasolinePrice !== null
                ? `R$ ${comparison.latestGasolinePrice.toFixed(2)}/L`
                : '—'}
            </div>
          </div>
          <div className="compare-col compare-eth">
            <h3>Álcool (Etanol)</h3>
            <div className="tabular">
              Média real:{' '}
              {comparison.ethanolStats.weightedKmPerLiter
                ? `${comparison.ethanolStats.weightedKmPerLiter.toFixed(2)} km/L`
                : '—'}
            </div>
            <div className="tabular">
              Custo/km:{' '}
              {comparison.ethanolCostPerKm !== null
                ? `R$ ${comparison.ethanolCostPerKm.toFixed(3)}/km`
                : '—'}
            </div>
            <div className="tabular">
              Teto ideal:{' '}
              {comparison.maxRecommendedEthanolPrice !== null
                ? `R$ ${comparison.maxRecommendedEthanolPrice.toFixed(2)}/L`
                : '—'}
            </div>
          </div>
        </div>
        <div className="muted-sm parity-foot tabular">
          Paridade energética aplicada:{' '}
          <strong>{(comparison.effectiveParityThreshold * 100).toFixed(1)}%</strong>{' '}
          {comparison.observedRatioEthanolToGasoline !== null
            ? '(medida diretamente no seu carro)'
            : comparison.inmetroRatioEthanolToGasoline !== null
            ? '(baseada no INMETRO do veículo)'
            : '(regra padrão 70%)'}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Gastos por Mês</h2>
            <span className="subtitle tabular">
              {latestMonth
                ? `Último mês (${latestMonth.label}): R$ ${latestMonth.totalCost.toFixed(
                    2
                  )} · ${latestMonth.totalLiters.toFixed(1)} L`
                : 'Acompanhamento financeiro mensal'}
            </span>
          </div>
        </div>
        <MonthlySpendingChart buckets={monthlySpending} />
        <div className="chart-legend">
          <span>
            <i className="dot dot-gas" /> Gasolina (R$)
          </span>
          <span>
            <i className="dot dot-eth" /> Álcool (R$)
          </span>
        </div>
      </section>
    </div>
  );
};
