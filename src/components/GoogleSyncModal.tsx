import React, { useRef, useState } from 'react';
import { AppState } from '../types';
import {
  downloadStateFromGoogleDrive,
  exportStateAsJson,
  parseImportedStateJson,
  requestGoogleAccessToken,
  uploadStateToGoogleDrive,
} from '../services/googleSync';
import { CloseIcon, CloudIcon } from './Icons';

interface GoogleSyncModalProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onLoadDemo: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export const GoogleSyncModal: React.FC<GoogleSyncModalProps> = ({
  state,
  onUpdateState,
  onLoadDemo,
  onClearAll,
  onClose,
}) => {
  const [clientId, setClientId] = useState(state.googleClientId || '');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveClientId = () => {
    onUpdateState({ ...state, googleClientId: clientId.trim() || undefined });
    setStatusMsg('Google Client ID salvo localmente.');
  };

  const handleGoogleUpload = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const token = await requestGoogleAccessToken(clientId);
      const syncedAt = await uploadStateToGoogleDrive(token, {
        ...state,
        googleClientId: clientId.trim(),
      });
      onUpdateState({
        ...state,
        googleClientId: clientId.trim(),
        lastGoogleSyncAt: syncedAt,
      });
      setStatusMsg('Backup salvo na sua Conta Google (Google Drive AppData).');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Erro ao sincronizar.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleDownload = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const token = await requestGoogleAccessToken(clientId);
      const remote = await downloadStateFromGoogleDrive(token);
      if (!remote) {
        setStatusMsg('Nenhum backup encontrado ainda na sua Conta Google.');
      } else {
        onUpdateState({
          ...remote,
          googleClientId: clientId.trim(),
          palette: state.palette,
        });
        setStatusMsg('Dados restaurados da sua Conta Google com sucesso.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Erro ao restaurar.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = () => {
    const json = exportStateAsJson(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fueltracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Arquivo JSON exportado.');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedStateJson(text);
      onUpdateState({
        ...imported,
        googleClientId: state.googleClientId,
        palette: state.palette,
      });
      setStatusMsg('Backup JSON importado com sucesso.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'JSON inválido.');
    }
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Nuvem Google e Backup"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-panel form-card">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title-wrap">
            <span className="sheet-icon-badge">
              <CloudIcon size={18} />
            </span>
            <div>
              <h2>Conta Google & Backup</h2>
              <span className="subtitle">
                Armazenamento local + sincronização no Google Drive
              </span>
            </div>
          </div>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Fechar"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="field-group">
          <label htmlFor="google-client-id">
            Google OAuth Client ID (Drive AppData)
          </label>
          <div className="inline-pair">
            <input
              id="google-client-id"
              type="text"
              placeholder="xxxxxxxxxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <button type="button" className="btn-inline" onClick={handleSaveClientId}>
              Salvar ID
            </button>
          </div>
          {state.lastGoogleSyncAt && (
            <span className="muted-sm tabular">
              Última sincronização:{' '}
              {new Date(state.lastGoogleSyncAt).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        <div className="grid-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !clientId.trim()}
            onClick={handleGoogleUpload}
          >
            {busy ? 'Conectando...' : 'Enviar para Conta Google'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !clientId.trim()}
            onClick={handleGoogleDownload}
          >
            Restaurar da Conta Google
          </button>
        </div>

        <hr className="divider" />

        <div className="grid-2">
          <button type="button" className="btn-secondary" onClick={handleExportJson}>
            Exportar Backup JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Importar Backup JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportJson}
          />
        </div>

        <div className="grid-2">
          <button
            type="button"
            className="btn-inline"
            onClick={() => {
              onLoadDemo();
              setStatusMsg('Dados demonstrativos carregados (Polo TSI).');
            }}
          >
            Carregar Dados Demo
          </button>
          <button
            type="button"
            className="btn-ghost-danger"
            onClick={() => {
              onClearAll();
              setStatusMsg('Todos os dados locais foram limpos.');
            }}
          >
            Limpar Dados Locais
          </button>
        </div>

        {statusMsg && <div className="feedback-banner">{statusMsg}</div>}
      </div>
    </div>
  );
};
