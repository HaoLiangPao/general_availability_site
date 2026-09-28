import { notFound, redirect } from "next/navigation";

const legacySlug: Record<string, string> = {
  interview: "interview", coffee: "coffee", in_person: "in-person", ski_lesson: "ski-lesson",
};

export default function LegacyBookingRedirect({ params }: { params: { type: string } }) {
  const slug = legacySlug[params.type];
  if (!slug) notFound();
  redirect(`/${slug}`);
}
