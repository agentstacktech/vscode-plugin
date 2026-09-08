import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { createRequire } from "module";
import * as nodePath from "path";
import { SECRET_KEY, getBaseUrl } from "./auth";

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  interval?: number;
  expires_in: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

const nodeRequire = createRequire(__filename);
// Shared RFC 8628 poll kernel (provided_plugins/shared/plugin-kernel)
const kernel = nodeRequire(
  nodePath.join(__dirname, "../../shared/plugin-kernel/deviceCodeClient.mjs")
) as {
  pollDeviceToken: (opts: Record<string, unknown>) => Promise<TokenResponse>;
  postForm: <T>(url: string, params: Record<string, string>, traceId: string) => Promise<T>;
};
const { pollDeviceToken, postForm: kernelPostForm } = kernel;

const CLIENT_ID = "vscode-plugin";
const REFRESH_SECRET_KEY = "agentstack.refreshToken";
const DEFAULT_SCOPE = [
  "mcp:execute",
  "mcp:read",
  "projects:read",
  "projects:write",
  "projects:admin",
  "8dna:read",
  "8dna:write",
  "logic:write",
  "logic:dry_run",
  "rag:read",
  "rag:write",
  "storage:read",
  "storage:write",
  "agents:run",
  "bots:run",
  "bots:admin",
  "buffs:read",
  "buffs:write",
  "apikeys:write",
].join(" ");

function platformBaseUrl(): string {
  return getBaseUrl().replace(/\/mcp\/?$/, "").replace(/\/$/, "");
}

async function postForm<T>(url: string, params: Record<string, string>, traceId: string): Promise<T> {
  return kernelPostForm(url, params, traceId) as Promise<T>;
}

async function authorize(scope: string, traceId: string): Promise<DeviceAuthorizationResponse> {
  return postForm<DeviceAuthorizationResponse>(
    `${platformBaseUrl()}/api/oauth2/device/authorize`,
    { client_id: CLIENT_ID, scope },
    traceId
  );
}

async function pollToken(init: DeviceAuthorizationResponse, traceId: string): Promise<TokenResponse> {
  return pollDeviceToken({
    tokenUrl: `${platformBaseUrl()}/api/oauth2/token`,
    clientId: CLIENT_ID,
    deviceCode: init.device_code,
    intervalSec: init.interval ?? 5,
    expiresInSec: init.expires_in,
    traceId,
  }) as Promise<TokenResponse>;
}

/** Refresh Bearer token when refresh_token is stored (OAuth Device Code). */
export async function refreshBearerTokenIfStale(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const stored = await context.secrets.get(REFRESH_SECRET_KEY);
  if (!stored) return false;
  let payload: { refresh_token?: string; scope?: string };
  try {
    payload = JSON.parse(stored) as { refresh_token?: string; scope?: string };
  } catch {
    return false;
  }
  if (!payload.refresh_token) return false;
  const traceId = randomUUID();
  try {
    const token = await postForm<TokenResponse>(
      `${platformBaseUrl()}/api/oauth2/token`,
      {
        grant_type: "refresh_token",
        refresh_token: payload.refresh_token,
        client_id: CLIENT_ID,
        scope: payload.scope || DEFAULT_SCOPE,
      },
      traceId
    );
    if (!token.access_token) return false;
    await context.secrets.store(SECRET_KEY, `Bearer ${token.access_token}`);
    if (token.refresh_token) {
      await context.secrets.store(
        REFRESH_SECRET_KEY,
        JSON.stringify({
          refresh_token: token.refresh_token,
          scope: token.scope || payload.scope,
          obtained_at: new Date().toISOString(),
        })
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function signInWithDeviceCode(context: vscode.ExtensionContext): Promise<string> {
  const traceId = randomUUID();
  const scope = DEFAULT_SCOPE;
  const init = await authorize(scope, traceId);
  const url = init.verification_uri_complete || init.verification_uri;

  void vscode.env.openExternal(vscode.Uri.parse(url));
  const copy = await vscode.window.showInformationMessage(
    `AgentStack sign-in opened in your browser. Code: ${init.user_code}`,
    { modal: false },
    "Copy code"
  );
  if (copy === "Copy code") {
    await vscode.env.clipboard.writeText(init.user_code);
  }

  const token = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Waiting for AgentStack browser approval...",
      cancellable: false,
    },
    () => pollToken(init, traceId)
  );

  await context.secrets.store(SECRET_KEY, `Bearer ${token.access_token}`);
  if (token.refresh_token) {
    await context.secrets.store(
      REFRESH_SECRET_KEY,
      JSON.stringify({
        refresh_token: token.refresh_token,
        scope: token.scope || scope,
        obtained_at: new Date().toISOString(),
      })
    );
  }
  await vscode.window.showInformationMessage(`AgentStack signed in. Trace: ${traceId}`);
  return traceId;
}
