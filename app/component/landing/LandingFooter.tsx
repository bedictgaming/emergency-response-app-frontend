import { PhoneCall, Shield, Smartphone } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="w-full border-t border-slate-200 bg-slate-50 py-10 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3 text-slate-950 dark:text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
                <Shield className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-bold tracking-tight">Cordova Emergency Response</span>
            </div>
            <p className="mt-3 max-w-md text-sm leading-6">
              Online community emergency reporting for Fire, Medical, Police, and Hazard incidents in Cordova, Cebu.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">Emergency help</h2>
            <a
              href="tel:911"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              Call 911
            </a>
          </div>

          <div>
            <div className="flex items-center gap-2 text-slate-950 dark:text-white">
              <Smartphone className="h-4 w-4 text-red-600" aria-hidden="true" />
              <h2 className="text-sm font-bold">Installable web app</h2>
            </div>
            <p className="mt-3 text-sm leading-6">
              Install from a supported browser for home-screen access. Internet is still required to submit a report.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6 text-xs dark:border-slate-800">
          <p>© {new Date().getFullYear()} Municipal Government of Cordova, Cebu.</p>
        </div>
      </div>
    </footer>
  );
}
