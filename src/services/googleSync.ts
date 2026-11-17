import { AppState } from '../types';

const BACKUP_FILE_NAME = 'fueltracker-backup.json';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let gsiLoadPromise: Promise<void> | null = null;

/**
 * Carrega o script Google Identity Services apenas sob demanda para manter
 * o startup do aplicativo instantâneo.
 */
function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Disponível apenas no navegador/Android WebView.'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) {
    return gsiLoadPromise;
  }

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Falha ao carregar Google Identity Services.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Não foi possível conectar ao serviço Google OAuth.'));
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

/**
 * Obtém token OAuth 2.0 do usuário Google para acessar exclusivamente a pasta
 * privada do aplicativo (drive.appdata) no Google Drive.
 */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  const trimmedId = clientId.trim();
  if (!trimmedId) {
    throw new Error('Informe o Google OAuth Client ID nas configurações de nuvem.');
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services indisponível neste dispositivo.');
  }

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: trimmedId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response: GoogleTokenResponse) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Autorização Google cancelada.'
            )
          );
          return;
        }
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function findBackupFileId(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Erro ao consultar Google Drive (${res.status}).`);
  }
  const json = (await res.json()) as { files?: Array<{ id: string }> };
  return json.files?.[0]?.id ?? null;
}

/**
 * Envia o estado atual do FuelTracker para a pasta appDataFolder do Google Drive do usuário.
 */
export async function uploadStateToGoogleDrive(
  accessToken: string,
  state: AppState
): Promise<string> {
  const existingId = await findBackupFileId(accessToken);
  const payload: AppState = {
    ...state,
    lastGoogleSyncAt: new Date().toISOString(),
  };
  const jsonBody = JSON.stringify(payload);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: jsonBody,
      }
    );
    if (!res.ok) {
      throw new Error(`Erro ao atualizar backup no Google Drive (${res.status}).`);
    }
    return payload.lastGoogleSyncAt!;
  }

  const boundary = `fueltracker_${Date.now()}`;
  const metadata = JSON.stringify({
    name: BACKUP_FILE_NAME,
    parents: ['appDataFolder'],
  });
  const multipartBody =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonBody}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    throw new Error(`Erro ao criar backup no Google Drive (${res.status}).`);
  }
  return payload.lastGoogleSyncAt!;
}

/**
 * Restaura o backup armazenado na conta Google do usuário.
 */
export async function downloadStateFromGoogleDrive(
  accessToken: string
): Promise<AppState | null> {
  const fileId = await findBackupFileId(accessToken);
  if (!fileId) {
    return null;
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Erro ao baixar backup do Google Drive (${res.status}).`);
  }
  const parsed = (await res.json()) as AppState;
  if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.entries)) {
    throw new Error('Formato de backup inválido no Google Drive.');
  }
  return parsed;
}

/**
 * Serializa e valida JSON de backup local para exportação/importação rápida.
 */
export function exportStateAsJson(state: AppState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 1,
      vehicles: state.vehicles,
      selectedVehicleId: state.selectedVehicleId,
      entries: state.entries,
    },
    null,
    2
  );
}

export function parseImportedStateJson(rawJson: string): AppState {
  const parsed = JSON.parse(rawJson) as Partial<AppState>;
  if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.entries)) {
    throw new Error('Arquivo JSON inválido: esperado campos vehicles e entries.');
  }
  return {
    vehicles: parsed.vehicles,
    selectedVehicleId:
      typeof parsed.selectedVehicleId === 'string'
        ? parsed.selectedVehicleId
        : parsed.vehicles[0]?.id ?? null,
    entries: parsed.entries,
  };
}
