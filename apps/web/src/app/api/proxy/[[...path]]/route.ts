import { NextRequest, NextResponse } from "next/server";
import { getIdToken } from "@/lib/gcp-auth";

export const runtime = "nodejs";

const CLOUD_RUN_URL = (process.env.CLOUD_RUN_URL || "https://stepd-server-872105344568.us-central1.run.app").replace(/\/$/, "");

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, params);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, params);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, params);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, params);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, params);
}

async function proxy(request: NextRequest, paramsPromise: Promise<{ path?: string[] }>) {
  const { path } = await paramsPromise;
  const upstreamPath = path ? `/${path.join("/")}` : "";
  const upstreamUrl = `${CLOUD_RUN_URL}${upstreamPath}${request.nextUrl.search}`;

  const token = await getIdToken();
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("Authorization", token);

  const body = request.body ? await request.arrayBuffer() : undefined;

  const upstreamRes = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete("content-encoding");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}
