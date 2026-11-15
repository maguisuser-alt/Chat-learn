import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { StudyGuide } from "@/models/StudyGuide";
import { resolveUserId } from "@/lib/user";

export const runtime = "nodejs";

/** Lista las guías del usuario (sin el texto completo). */
export async function GET(req: Request) {
  const userId = await resolveUserId(new URL(req.url).searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Identifícate para ver tus guías" }, { status: 401 });

  await connectDB();
  const user = await User.findOne({ clientId: userId });
  if (!user) return NextResponse.json([]);

  const guides = await StudyGuide.find({ userId: user._id }).sort({ createdAt: -1 });
  return NextResponse.json(guides.map((g) => ({ ...g.toJSON(), id: g._id.toString() })));
}
