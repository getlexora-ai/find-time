import { NextRequest, NextResponse } from "next/server";
import { seed, DEMO_USER_ID } from "@/server/store/seed";
import { getStore, listBy } from "@/server/store/db";
import type { Project } from "@/lib/types";

export async function GET() {
  seed();
  const store = getStore();
  const projects = listBy(store.projects, DEMO_USER_ID);
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  seed();
  const store = getStore();
  const body = await req.json();
  const now = new Date().toISOString();
  const id = `proj_${crypto.randomUUID()}`;
  const project: Project = {
    id,
    userId: DEMO_USER_ID,
    name: "Untitled project",
    color: "lime",
    description: null,
    status: "active",
    targetDate: null,
    order: store.projects.size,
    createdAt: now,
    ...body,
  };
  store.projects.set(id, project);
  return NextResponse.json({ project }, { status: 201 });
}
