import { MapPin } from 'lucide-react';

const barangays = [
  'Alegria',
  'Bangbang',
  'Buagsong',
  'Catarman',
  'Cogon',
  'Dapitan',
  'Day-as',
  'Gabi',
  'Gilutongan',
  'Ibabao',
  'Pilipog',
  'Poblacion',
  'San Miguel',
];

export function BarangayCoverageSection() {
  return (
    <section id="coverage" className="w-full bg-white py-16 sm:py-20 dark:bg-slate-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-8">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">Cordova barangays in the reporting form</h2>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Select the incident barangay and confirm the exact map location before submitting a report.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-red-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:ring-slate-700">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Recognized Cordova locations</p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {barangays.map((barangay) => (
              <li key={barangay} className="text-sm text-slate-700 dark:text-slate-300">{barangay}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
