import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl sm:text-5xl font-bold text-center mb-4 tracking-tight">
          Nexus<span className="text-blue-500">Health</span>
        </h1>
        <p className="text-center text-gray-400 mb-16 text-lg">
          Intelligent Hospital Resource Load Balancer
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mx-auto">
          {/* Patient Portal Card */}
          <Link href="/patient" className="glass-card p-8 hover:bg-white/5 transition-all cursor-pointer group">
            <h2 className="text-2xl font-semibold mb-3 group-hover:text-blue-400 transition-colors">Patient Intake &rarr;</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Submit symptoms, upload images, and request appointments securely.
            </p>
          </Link>

          {/* Doctor Portal Card */}
          <Link href="/doctor" className="glass-card p-8 hover:bg-white/5 transition-all cursor-pointer group">
            <h2 className="text-2xl font-semibold mb-3 group-hover:text-green-400 transition-colors">Physician Portal &rarr;</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Review assigned cases and confirm appointments. (@ycce.in access only)
            </p>
          </Link>

          {/* Admin / Dispatch Card */}
          <Link href="/admin" className="glass-card p-8 hover:bg-white/5 transition-all cursor-pointer group hover:border-red-500/30">
            <h2 className="text-2xl font-semibold mb-3 group-hover:text-red-400 transition-colors">Admin Dispatch &rarr;</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Live resource monitoring, bed allocation, and emergency WhatsApp triage.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}