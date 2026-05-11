import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { SECRET_KEY, getBaseUrl } from "./auth";

const CLIENT_ID = "vscode-plugin";
const REFRESH_SECRET_KEY = "agentstack.refreshToken";
const DEFAULT_SCOPE = [
  "mcp:execute",
  "projects:read",
  "projects:write",
  "8dna:read",
  "8dna:write",
  "logic:write",
  "logic:dry_run",
  "rag:read",
  "rag:write",
  "storage:read",
  "storage:write",
  "buffs:read",
  "apikeys:write",
].join(" ");

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

function platformBaseUrl(): string {
  return getBaseUrl().replace(/\/mcp\/?$/, "").replace(/\/$/, "");
}

async function postForm<T>(url: string, params: Record<string, string>, traceId: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Trace-Id": traceId,
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `HTTP ${res.status}`);
  }
  return json;
}

async function authorize(scope: string, traceId: string): Promise<DeviceAuthorizationResponse> {
  return postForm<DeviceAuthorizationResponse>(
    `${platformBaseUrl()}/api/oauth2/device/authorize`,
    { client_id: CLIENT_ID, scope },
    traceId
  );
}

async function pollToken(init: DeviceAuthorizationResponse, traceId: string): Promise<TokenResponse> {
  const deadline = Date.now() + init.expires_in * 1000;
  let waitMs = Math.max(1, init.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const token = await postForm<TokenResponse>(
      `${platformBaseUrl()}/api/oauth2/token`,
      {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: init.device_code,
        client_id: CLIENT_ID,
      },
      traceId
    ).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

    if ("access_token" in token && token.access_token) return token;
    if (token.error === "authorization_pending") continue;
    if (token.error === "slow_down") {
      waitMs += 5000;
      continue;
    }
    if (token.error === "access_denied") throw new Error("Authorization was denied.");
    if (token.error === "expired_token") throw new Error("Device code expired.");
    const errorDescription = "error_description" in token ? token.error_description : undefined;
    throw new Error(errorDescription || token.error || "Token exchange failed.");
  }
  throw new Error("Device code expired.");
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
