export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    workspaceRoot: process.env.WORKSPACE_ROOT ?? null,
    phase: "1",
  });
}
