import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const offerings = [
  { icon: "💼", name: "Job Interview", detail: "45 min · approval required", description: "For recruiters and hiring managers. The host reviews your requested time before an invite is sent.", color: "#58a6ff" },
  { icon: "☕", name: "Coffee Chat", detail: "30 min", description: "A relaxed conversation to exchange ideas, network, or say hello.", color: "#a371f7" },
  { icon: "🤝", name: "In-Person Event", detail: "60 min", description: "Meet face to face for collaboration, workshops, or special occasions.", color: "#3fb950" },
  { icon: "⛷️", name: "Ski Lesson", detail: "60 min · card or e-transfer", description: "A one-hour lesson with a choice of payment methods and WINTER10 discount.", color: "#00d2ff" },
];

export default async function Home() {
  const brands = await prisma.brand.findMany({ select: { slug: true, name: true }, take: 10 }).catch(() => null);
  if (brands?.length === 1) redirect(`/u/${brands[0].slug}`);

  return (
    <main className="min-h-dvh px-5 py-12 sm:py-20">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--bk-muted)] mb-4">Book time with me</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-4">Choose how we meet.</h1>
        <p className="text-[var(--bk-muted)] text-lg mb-9">Pick a meeting type and find a time that works for you.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {offerings.map((item) => (
            <div key={item.name} className="bk-card p-5" style={{ borderTop: `3px solid ${item.color}` }}>
              <div className="text-3xl mb-4" aria-hidden="true">{item.icon}</div>
              <h2 className="text-lg font-semibold">{item.name}</h2>
              <p className="text-sm text-[var(--bk-muted)] mt-1">{item.detail}</p>
              <p className="text-sm mt-3">{item.description}</p>
            </div>
          ))}
        </div>
        {brands?.length ? (
          <div className="mt-9 flex flex-wrap gap-3">
            {brands.map((brand) => <Link key={brand.slug} href={`/u/${brand.slug}`} className="bk-btn bk-btn-primary">Book with {brand.name}</Link>)}
          </div>
        ) : (
          <p className="mt-9 text-sm text-[var(--bk-muted)]" role="status">
            {brands === null ? "The site is online. Booking opens after the database and calendar are connected." : "Booking setup is in progress. Please check back soon."}
          </p>
        )}
      </div>
    </main>
  );
}
