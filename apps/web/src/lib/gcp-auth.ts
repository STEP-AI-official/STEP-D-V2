import { GoogleAuth } from "google-auth-library";

let authClient: ReturnType<typeof createIdTokenClient> | null = null;

function createIdTokenClient() {
  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  const targetAudience = process.env.CLOUD_RUN_URL || "";
  if (!keyJson) throw new Error("GCP_SERVICE_ACCOUNT_KEY not set");
  const credentials = JSON.parse(keyJson);
  const auth = new GoogleAuth({ credentials });
  return auth.getIdTokenClient(targetAudience);
}

export async function getIdToken(): Promise<string> {
  if (!authClient) {
    authClient = createIdTokenClient();
  }
  const client = await authClient;
  const headers = await client.getRequestHeaders();
  return (headers as unknown as Record<string, string>)["Authorization"] ?? "";
}
