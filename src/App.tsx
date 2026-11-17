import React, { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  ColorPaletteId,
  FUEL_LABELS,
  FuelType,
  RefuelEntry,
  Vehicle,
} from './types';
import {
  EMPTY_APP_STATE,
  createDemoState,
  loadAppState,
  saveAppState,
} from './services/storage';
import {
  calculateConsumptionIntervals,
  sortEntriesChronologically,
} from './services/fuelCalculator';
import {
  calculateMonthlySpending,
  compareGasolineVsEthanol,
} from './services/statisticalEngine';
import { RefuelForm } from './components/RefuelForm';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { VehicleRegistration } from './components/VehicleRegistration';
import { HistoryList } from './components/HistoryList';
import { GoogleSyncModal } from './components/GoogleSyncModal';
import {
  AlertIcon,
  CarIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  FuelPumpIcon,
  HistoryIcon,
  PlusIcon,
} from './components/Icons';

type TabKey = 'home' | 'analytics' | 'vehicles';

const PALETTES: Array<{
  id: ColorPaletteId;
  name: string;
  bg: string;
  accent: string;
}> = [
  { id: 'terracotta', name: 'Terracotta (ColorHunt)', bg: '#F4F1DE', accent: '#E07A5F' },
  { id: 'espresso', name: 'Espresso (ColorHunt)', bg: '#FAF7F0', accent: '#B17457' },
  { id: 'nordic', name: 'Nordic (ColorHunt)', bg: '#F9F7F7', accent: '#3F72AF' },
  { id: 'matcha', name: 'Matcha (ColorHunt)', bg: '#F6F5F0', accent: '#3A5A40' },
];

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showRefuelModal, setShowRefuelModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const activePalette: ColorPaletteId = state.palette ?? 'terracotta';

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = activePalette;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const matched = PALETTES.find((p) => p.id === activePalette);
    if (themeMeta && matched) {
      themeMeta.setAttribute('content', matched.bg);
    }
  }, [activePalette]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 3600);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const activeVehicle = useMemo(
    () =>
      state.vehicles.find((v) => v.id === state.selectedVehicleId) ??
      state.vehicles[0] ??
      null,
    [state.vehicles, state.selectedVehicleId]
  );

  const vehicleEntries = useMemo(() => {
    if (!activeVehicle) return [];
    return sortEntriesChronologically(
      state.entries.filter((e) => e.vehicleId === activeVehicle.id)
    );
  }, [state.entries, activeVehicle]);

  const lastOdometerKm =
    vehicleEntries.length > 0
      ? vehicleEntries[vehicleEntries.length - 1].odometerKm
      : null;

  const lastPrices = useMemo(() => {
    const prices: Partial<Record<FuelType, number>> = {};
    for (const entry of vehicleEntries) {
      if (entry.pricePerLiter > 0) {
        prices[entry.fuelType] = entry.pricePerLiter;
      }
    }
    return prices;
  }, [vehicleEntries]);

  const intervals = useMemo(() => {
    if (!activeVehicle) return [];
    return calculateConsumptionIntervals(state.entries, activeVehicle);
  }, [state.entries, activeVehicle]);

  const comparison = useMemo(
    () =>
      compareGasolineVsEthanol(
        intervals,
        state.entries,
        activeVehicle ?? undefined
      ),
    [intervals, state.entries, activeVehicle]
  );

  const monthlySpending = useMemo(
    () => calculateMonthlySpending(state.entries, activeVehicle?.id),
    [state.entries, activeVehicle]
  );

  const allAlerts = useMemo(
    () => [...comparison.gasolineStats.alerts, ...comparison.ethanolStats.alerts],
    [comparison]
  );

  const latestMonth = monthlySpending[monthlySpending.length - 1];

  const handleAddEntry = (entryData: Omit<RefuelEntry, 'id'>) => {
    const newEntry: RefuelEntry = {
      ...entryData,
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setState((prev) => ({
      ...prev,
      entries: [...prev.entries, newEntry],
    }));
    setShowRefuelModal(false);
    setToastMsg(
      `Abastecimento salvo: ${newEntry.liters.toFixed(2)} L de ${
        FUEL_LABELS[newEntry.fuelType].split(' ')[0]
      }`
    );
  };

  const handleDeleteEntry = (entryId: string) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== entryId),
    }));
  };

  const handleAddVehicle = (vehicle: Vehicle) => {
    setState((prev) => ({
      ...prev,
      vehicles: [...prev.vehicles, vehicle],
      selectedVehicleId: vehicle.id,
    }));
    setActiveTab('home');
    setToastMsg(`Veículo "${vehicle.nickname}" salvo na garagem.`);
  };

  const handleDeleteVehicle = (vehicleId: string) => {
    setState((prev) => {
      const remaining = prev.vehicles.filter((v) => v.id !== vehicleId);
      return {
        ...prev,
        vehicles: remaining,
        entries: prev.entries.filter((e) => e.vehicleId !== vehicleId),
        selectedVehicleId:
          prev.selectedVehicleId === vehicleId
            ? remaining[0]?.id ?? null
            : prev.selectedVehicleId,
      };
    });
  };

  return (
    <div className="app-viewport">
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-block">
            <span className="brand-mark">
              <FuelPumpIcon size={18} />
            </span>
            <div>
              <h1>FuelTracker</h1>
              <span className="topbar-sub tabular">
                {activeVehicle
                  ? `${activeVehicle.nickname} · ${activeVehicle.tankCapacityLiters}L`
                  : 'Nenhum carro selecionado'}
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="palette-dots" role="group" aria-label="Paleta ColorHunt">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  aria-label={p.name}
                  className={`palette-swatch ${
                    activePalette === p.id ? 'active' : ''
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${p.bg} 48%, ${p.accent} 48%)`,
                  }}
                  onClick={() =>
                    setState((prev) => ({ ...prev, palette: p.id }))
                  }
                />
              ))}
            </div>

            <button
              type="button"
              className="btn-cloud inline-icon-row"
              onClick={() => setShowSyncModal(true)}
              aria-label="Sincronização Google e Backup"
            >
              <CloudIcon size={16} />
              <span>Nuvem</span>
            </button>
          </div>
        </header>

        {toastMsg && (
          <div className="toast-banner" role="status" onClick={() => setToastMsg(null)}>
            <CheckIcon size={16} />
            <span>{toastMsg}</span>
          </div>
        )}

        <main className="main-content">
          {activeTab === 'home' && (
            <div className="stack-gap">
              {!activeVehicle ? (
                <section className="card empty-state">
                  <CarIcon size={30} />
                  <h2>Configure seu primeiro carro</h2>
                  <p>
                    Cadastre seu veículo com validação cruzada da Tabela FIPE e
                    INMETRO para calcular médias precisas pelos palitinhos do painel.
                  </p>
                  <div className="empty-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setActiveTab('vehicles')}
                    >
                      Ir para Garagem
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setState((prev) => ({
                          ...createDemoState(),
                          googleClientId: prev.googleClientId,
                          palette: prev.palette,
                        }));
                        setToastMsg('Dados demonstrativos carregados.');
                      }}
                    >
                      Carregar Exemplo
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {state.vehicles.length > 1 && (
                    <div className="vehicle-bar">
                      <label htmlFor="active-veh-select" className="muted-sm">
                        Veículo ativo
                      </label>
                      <select
                        id="active-veh-select"
                        className="vehicle-select"
                        value={activeVehicle.id}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            selectedVehicleId: e.target.value,
                          }))
                        }
                      >
                        {state.vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nickname}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <section className="hero-card">
                    <div className="hero-top">
                      <div>
                        <span className="hero-eyebrow">Resumo de Rendimento</span>
                        <h2 className="hero-title">{activeVehicle.nickname}</h2>
                      </div>
                      <button
                        type="button"
                        className="btn-primary btn-compact inline-icon-row"
                        onClick={() => setShowRefuelModal(true)}
                      >
                        <PlusIcon size={16} />
                        <span>Abastecer</span>
                      </button>
                    </div>

                    <div className="hero-metrics">
                      <div className="hero-metric">
                        <span className="metric-label">Gasolina</span>
                        <strong className="metric-val tabular">
                          {comparison.gasolineStats.weightedKmPerLiter > 0
                            ? `${comparison.gasolineStats.weightedKmPerLiter.toFixed(
                                2
                              )} km/L`
                            : '—'}
                        </strong>
                      </div>
                      <div className="hero-metric">
                        <span className="metric-label">Álcool</span>
                        <strong className="metric-val tabular">
                          {comparison.ethanolStats.weightedKmPerLiter > 0
                            ? `${comparison.ethanolStats.weightedKmPerLiter.toFixed(
                                2
                              )} km/L`
                            : '—'}
                        </strong>
                      </div>
                      <div className="hero-metric">
                        <span className="metric-label">
                          {latestMonth ? `Gasto ${latestMonth.label}` : 'Gasto mês'}
                        </span>
                        <strong className="metric-val tabular">
                          {latestMonth
                            ? `R$ ${latestMonth.totalCost.toFixed(0)}`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </section>

                  {allAlerts.length > 0 && (
                    <button
                      type="button"
                      className="alert-teaser"
                      onClick={() => setActiveTab('analytics')}
                    >
                      <span className="inline-icon-row">
                        <AlertIcon size={17} />
                        <span>
                          <strong>{allAlerts.length} alerta(s) estatístico(s):</strong>{' '}
                          {allAlerts[0].title}
                        </span>
                      </span>
                      <ChevronRightIcon size={16} />
                    </button>
                  )}

                  <HistoryList
                    vehicle={activeVehicle}
                    entries={state.entries}
                    intervals={intervals}
                    onDeleteEntry={handleDeleteEntry}
                    title="Últimos Abastecimentos"
                  />
                </>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard
              vehicle={activeVehicle}
              intervals={intervals}
              comparison={comparison}
              monthlySpending={monthlySpending}
            />
          )}

          {activeTab === 'vehicles' && (
            <VehicleRegistration
              vehicles={state.vehicles}
              selectedVehicleId={activeVehicle?.id ?? null}
              onSelectVehicle={(id) =>
                setState((prev) => ({ ...prev, selectedVehicleId: id }))
              }
              onAddVehicle={handleAddVehicle}
              onDeleteVehicle={handleDeleteVehicle}
            />
          )}
        </main>

        <nav className="bottom-nav" aria-label="Navegação principal">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <HistoryIcon size={19} />
            <span>Início</span>
          </button>

          <button
            type="button"
            className="nav-fab"
            onClick={() => setShowRefuelModal(true)}
            aria-label="Novo abastecimento"
          >
            <PlusIcon size={20} />
            <span>Abastecer</span>
          </button>

          <button
            type="button"
            className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <span className="nav-icon-wrap">
              <ChartIcon size={19} />
              {allAlerts.length > 0 && (
                <em className="alert-dot" aria-label={`${allAlerts.length} alertas`}>
                  {allAlerts.length}
                </em>
              )}
            </span>
            <span>Análises</span>
          </button>

          <button
            type="button"
            className={`nav-btn ${activeTab === 'vehicles' ? 'active' : ''}`}
            onClick={() => setActiveTab('vehicles')}
          >
            <CarIcon size={19} />
            <span>Garagem</span>
          </button>
        </nav>

        {showRefuelModal && (
          <RefuelForm
            vehicle={activeVehicle}
            lastOdometerKm={lastOdometerKm}
            lastPrices={lastPrices}
            onAddEntry={handleAddEntry}
            onGoToVehicles={() => setActiveTab('vehicles')}
            onClose={() => setShowRefuelModal(false)}
          />
        )}

        {showSyncModal && (
          <GoogleSyncModal
            state={state}
            onUpdateState={setState}
            onLoadDemo={() => {
              setState((prev) => ({
                ...createDemoState(),
                googleClientId: prev.googleClientId,
                palette: prev.palette,
              }));
            }}
            onClearAll={() => {
              setState((prev) => ({
                ...EMPTY_APP_STATE,
                googleClientId: prev.googleClientId,
                palette: prev.palette,
              }));
            }}
            onClose={() => setShowSyncModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default App;
