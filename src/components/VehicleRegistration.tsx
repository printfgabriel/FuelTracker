import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleSpec } from '../types';
import {
  buildVehicleFromInput,
  crossValidateVehicleRegistration,
  extractYearFromQuery,
  lookupVehicleSpecs,
  verifyVehicleInFipe,
} from '../services/vehicleValidator';
import {
  CarIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  TrashIcon,
} from './Icons';

interface VehicleRegistrationProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
  onAddVehicle: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicleId: string) => void;
}

export const VehicleRegistration: React.FC<VehicleRegistrationProps> = ({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  onAddVehicle,
  onDeleteVehicle,
}) => {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showManualSpecs, setShowManualSpecs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpec, setSelectedSpec] = useState<VehicleSpec | null>(null);
  const [nickname, setNickname] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(2023);
  const [tankCapacityLiters, setTankCapacityLiters] = useState(52);
  const [gaugeSegments, setGaugeSegments] = useState(8);
  const [reserveLiters, setReserveLiters] = useState(6.5);
  const [inmetroCityGas, setInmetroCityGas] = useState<string>('');
  const [inmetroHighwayGas, setInmetroHighwayGas] = useState<string>('');
  const [inmetroCityEth, setInmetroCityEth] = useState<string>('');
  const [inmetroHighwayEth, setInmetroHighwayEth] = useState<string>('');
  const [fipeStatus, setFipeStatus] = useState<
    'idle' | 'checking' | 'verified' | 'not_found'
  >('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const specSuggestions = useMemo(
    () => lookupVehicleSpecs(searchQuery, 10),
    [searchQuery]
  );

  const resetForm = () => {
    setShowManualSpecs(false);
    setSearchQuery('');
    setSelectedSpec(null);
    setNickname('');
    setBrand('');
    setModel('');
    setYear(2023);
    setTankCapacityLiters(52);
    setGaugeSegments(8);
    setReserveLiters(6.5);
    setInmetroCityGas('');
    setInmetroHighwayGas('');
    setInmetroCityEth('');
    setInmetroHighwayEth('');
    setFipeStatus('idle');
    setFormError(null);
  };

  const applySpec = async (spec: VehicleSpec) => {
    const queriedYear = extractYearFromQuery(searchQuery);
    const resolvedYear =
      queriedYear && queriedYear >= spec.yearStart && queriedYear <= spec.yearEnd
        ? queriedYear
        : Math.min(2025, spec.yearEnd);

    setSelectedSpec(spec);
    setShowManualSpecs(false);
    setBrand(spec.brand);
    setModel(spec.model);
    setYear(resolvedYear);
    setNickname(`${spec.brand} ${spec.model}`);
    setTankCapacityLiters(spec.tankCapacityLiters);
    setGaugeSegments(spec.gaugeSegments);
    setReserveLiters(spec.reserveLiters);
    setInmetroCityGas(String(spec.inmetroCityGasolineKmL));
    setInmetroHighwayGas(String(spec.inmetroHighwayGasolineKmL));
    setInmetroCityEth(String(spec.inmetroCityEthanolKmL));
    setInmetroHighwayEth(String(spec.inmetroHighwayEthanolKmL));
    setFormError(null);

    setFipeStatus('checking');
    const fipeCheck = await verifyVehicleInFipe(spec.brand, spec.model.split(' ')[0]);
    setFipeStatus(fipeCheck.verified ? 'verified' : 'not_found');
  };

  const handleCheckFipe = async () => {
    if (!brand.trim() || !model.trim()) return;
    setFipeStatus('checking');
    const res = await verifyVehicleInFipe(brand, model.split(' ')[0]);
    setFipeStatus(res.verified ? 'verified' : 'not_found');
  };

  const validation = useMemo(() => {
    return crossValidateVehicleRegistration(
      {
        nickname,
        brand,
        model,
        year,
        tankCapacityLiters,
        gaugeSegments,
        reserveLiters,
        inmetroCityGasolineKmL: parseFloat(inmetroCityGas) || undefined,
        inmetroHighwayGasolineKmL: parseFloat(inmetroHighwayGas) || undefined,
        inmetroCityEthanolKmL: parseFloat(inmetroCityEth) || undefined,
        inmetroHighwayEthanolKmL: parseFloat(inmetroHighwayEth) || undefined,
      },
      selectedSpec ?? undefined,
      fipeStatus === 'verified'
    );
  }, [
    nickname,
    brand,
    model,
    year,
    tankCapacityLiters,
    gaugeSegments,
    reserveLiters,
    inmetroCityGas,
    inmetroHighwayGas,
    inmetroCityEth,
    inmetroHighwayEth,
    selectedSpec,
    fipeStatus,
  ]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) {
      setFormError(validation.errors[0] || 'Corrija os campos inválidos.');
      return;
    }
    const newVehicle = buildVehicleFromInput(
      {
        nickname,
        brand,
        model,
        year,
        tankCapacityLiters,
        gaugeSegments,
        reserveLiters,
        inmetroCityGasolineKmL: parseFloat(inmetroCityGas) || undefined,
        inmetroHighwayGasolineKmL: parseFloat(inmetroHighwayGas) || undefined,
        inmetroCityEthanolKmL: parseFloat(inmetroCityEth) || undefined,
        inmetroHighwayEthanolKmL: parseFloat(inmetroHighwayEth) || undefined,
      },
      validation
    );
    onAddVehicle(newVehicle);
    resetForm();
    setShowAddSheet(false);
  };

  return (
    <div className="stack-gap">
      <section className="card">
        <div className="card-header">
          <div className="inline-icon-row">
            <CarIcon size={20} />
            <div>
              <h2>Garagem</h2>
              <span className="subtitle">
                Veículos validados com capacidade do tanque e marcador
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary btn-compact inline-icon-row"
            onClick={() => {
              resetForm();
              setShowAddSheet(true);
            }}
          >
            <PlusIcon size={16} />
            <span>Adicionar</span>
          </button>
        </div>

        {vehicles.length === 0 ? (
          <div className="empty-state">
            <p>
              Nenhum carro cadastrado ainda. Adicione um veículo para iniciar a
              validação cruzada com a Tabela FIPE e base INMETRO.
            </p>
            <button
              type="button"
              className="btn-primary inline-icon-row"
              onClick={() => setShowAddSheet(true)}
            >
              <PlusIcon size={16} />
              <span>Cadastrar meu primeiro carro</span>
            </button>
          </div>
        ) : (
          <div className="vehicle-list">
            {vehicles.map((v) => {
              const isSelected = v.id === selectedVehicleId;
              return (
                <div
                  key={v.id}
                  className={`vehicle-item ${isSelected ? 'selected' : ''}`}
                >
                  <div
                    className="vehicle-main"
                    onClick={() => onSelectVehicle(v.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="vehicle-title">
                      <strong>{v.nickname}</strong>
                      {isSelected && <span className="badge badge-gas">Ativo</span>}
                      <span
                        className={`badge tabular ${
                          v.validationStatus === 'VERIFIED'
                            ? 'badge-ok'
                            : v.validationStatus === 'ADJUSTED_WARNING'
                            ? 'badge-warn'
                            : 'badge-muted'
                        }`}
                      >
                        {v.validationStatus === 'VERIFIED'
                          ? `Validado (${v.validationScore}%)`
                          : v.validationStatus === 'ADJUSTED_WARNING'
                          ? `Ajustado (${v.validationScore}%)`
                          : 'Personalizado'}
                      </span>
                    </div>
                    <div className="muted-sm tabular">
                      {v.brand} {v.model} ({v.year}) · Tanque {v.tankCapacityLiters} L ·{' '}
                      {v.gaugeSegments} palitinhos
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost-danger inline-icon-row"
                    onClick={() => onDeleteVehicle(v.id)}
                    aria-label={`Remover ${v.nickname}`}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showAddSheet && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddSheet(false);
          }}
        >
          <form
            className="sheet-panel form-card"
            onSubmit={handleSave}
            role="dialog"
            aria-modal="true"
            aria-label="Cadastrar Carro"
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div className="sheet-title-wrap">
                <span className="sheet-icon-badge">
                  <CarIcon size={18} />
                </span>
                <div>
                  <h2>Cadastrar Carro</h2>
                  <span className="subtitle">
                    Validação cruzada INMETRO/Montadora + API FIPE
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-close-btn"
                onClick={() => setShowAddSheet(false)}
                aria-label="Fechar cadastro"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="field-group">
              <label htmlFor="spec-search">Buscar modelo na base pública</label>
              <input
                id="spec-search"
                type="text"
                placeholder="Ex: Palio ELX 2010 1.0, Gol G5, Onix, HB20, Civic..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedSpec(null);
                }}
              />
              <div className="chip-grid">
                {specSuggestions.map((spec) => (
                  <button
                    key={spec.id}
                    type="button"
                    className={`spec-chip ${
                      selectedSpec?.id === spec.id ? 'active' : ''
                    }`}
                    onClick={() => applySpec(spec)}
                  >
                    <strong>
                      {spec.brand} {spec.model}
                    </strong>
                    <span className="tabular">
                      {spec.yearStart}–{spec.yearEnd} · {spec.tankCapacityLiters} L ·{' '}
                      {spec.gaugeSegments} pal.
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid-3">
              <div className="field-group">
                <label htmlFor="veh-brand">Marca</label>
                <input
                  id="veh-brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Volkswagen"
                  required
                />
              </div>
              <div className="field-group">
                <label htmlFor="veh-model">Modelo</label>
                <input
                  id="veh-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Polo 1.0 TSI"
                  required
                />
              </div>
              <div className="field-group">
                <label htmlFor="veh-year">Ano</label>
                <input
                  id="veh-year"
                  type="number"
                  min="1970"
                  max="2028"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="tabular"
                  required
                />
              </div>
            </div>

            {selectedSpec && !showManualSpecs ? (
              <div className="auto-spec-card">
                <div className="auto-spec-row">
                  <div>
                    <span className="kpi-label">
                      Especificação oficial aplicada automaticamente
                    </span>
                    <strong className="tabular auto-spec-main">
                      Tanque {tankCapacityLiters} L · Marcador de {gaugeSegments}{' '}
                      palitinhos
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="btn-inline"
                    onClick={() => setShowManualSpecs(true)}
                  >
                    Ajustar manualmente
                  </button>
                </div>
                <div className="field-group">
                  <label htmlFor="veh-nick">Apelido (opcional)</label>
                  <input
                    id="veh-nick"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Meu Carro"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid-3">
                  <div className="field-group">
                    <label htmlFor="veh-tank">Tanque (L)</label>
                    <input
                      id="veh-tank"
                      type="number"
                      step="0.5"
                      min="20"
                      max="120"
                      value={tankCapacityLiters}
                      onChange={(e) => setTankCapacityLiters(Number(e.target.value))}
                      className="tabular"
                      required
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="veh-bars">Palitinhos</label>
                    <input
                      id="veh-bars"
                      type="number"
                      min="4"
                      max="24"
                      step="1"
                      value={gaugeSegments}
                      onChange={(e) => setGaugeSegments(Number(e.target.value))}
                      className="tabular"
                      required
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="veh-nick">Apelido</label>
                    <input
                      id="veh-nick"
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Meu Carro"
                    />
                  </div>
                </div>

                <div className="grid-2">
                  <div className="field-group">
                    <label htmlFor="inmetro-gas">INMETRO Gasolina (Cid / Est)</label>
                    <div className="inline-pair">
                      <input
                        id="inmetro-gas"
                        type="number"
                        step="0.1"
                        placeholder="Cidade"
                        value={inmetroCityGas}
                        onChange={(e) => setInmetroCityGas(e.target.value)}
                        className="tabular"
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Estrada"
                        value={inmetroHighwayGas}
                        onChange={(e) => setInmetroHighwayGas(e.target.value)}
                        className="tabular"
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <label htmlFor="inmetro-eth">INMETRO Álcool (Cid / Est)</label>
                    <div className="inline-pair">
                      <input
                        id="inmetro-eth"
                        type="number"
                        step="0.1"
                        placeholder="Cidade"
                        value={inmetroCityEth}
                        onChange={(e) => setInmetroCityEth(e.target.value)}
                        className="tabular"
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Estrada"
                        value={inmetroHighwayEth}
                        onChange={(e) => setInmetroHighwayEth(e.target.value)}
                        className="tabular"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {(brand || model) && (
              <div
                className={`validation-box ${
                  !validation.isValid
                    ? 'val-error'
                    : validation.status === 'VERIFIED'
                    ? 'val-ok'
                    : 'val-warn'
                }`}
              >
                <div className="validation-header">
                  <strong className="tabular">
                    Validação:{' '}
                    {!validation.isValid
                      ? 'Inválido'
                      : validation.status === 'VERIFIED'
                      ? `Aprovado (${validation.confidenceScore}%)`
                      : validation.status === 'ADJUSTED_WARNING'
                      ? `Divergência (${validation.confidenceScore}%)`
                      : `Personalizado (${validation.confidenceScore}%)`}
                  </strong>
                  <button
                    type="button"
                    className="btn-inline inline-icon-row"
                    onClick={handleCheckFipe}
                  >
                    {fipeStatus === 'checking' ? (
                      <span>Consultando FIPE...</span>
                    ) : fipeStatus === 'verified' ? (
                      <>
                        <CheckIcon size={14} />
                        <span>FIPE OK</span>
                      </>
                    ) : (
                      <span>Checar FIPE</span>
                    )}
                  </button>
                </div>
                {validation.matchedSpec?.gaugeNotes && (
                  <p className="muted-sm">{validation.matchedSpec.gaugeNotes}</p>
                )}
                {validation.errors.map((err, i) => (
                  <p key={`e_${i}`} className="val-msg-error">
                    • {err}
                  </p>
                ))}
                {validation.warnings.map((w, i) => (
                  <p key={`w_${i}`} className="val-msg-warn">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {formError && <div className="error-banner">{formError}</div>}

            <div className="sheet-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAddSheet(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Salvar Veículo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
