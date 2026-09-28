import { AlertTriangle, Flame, HeartPulse, Shield } from 'lucide-react';

const services = [
  {
    name: 'Fire',
    description: 'Choose Fire for fire, smoke, or rescue-related incidents.',
    icon: Flame,
    iconClass: 'bg-red-50 text-red-600 dark:bg-red-950/40',
  },
  {
    name: 'Medical',
    description: 'Choose Medical when someone needs urgent health assistance.',
    icon: HeartPulse,
    iconClass: 'bg-red-50 text-red-600 dark:bg-red-950/40',
  },
  {
    name: 'Police',
    description: 'Choose Police for urgent public-safety or security incidents.',
    icon: Shield,
    iconClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  },
  {
    name: 'Hazard',
    description: 'Choose Hazard for flooding, unsafe conditions, or disaster risks.',
    icon: AlertTriangle,
    iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
];

export function ServicesBento() {
  return (
    <section id="services" className="w-full bg-white py-16 sm:py-20 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            Choose the service the incident needs
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Reports can request one service or several services for the same incident.
          </p>
        </div>

        <div className="mt-10 grid border-y border-slate-200 md:grid-cols-2 dark:border-slate-800">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <div
                key={service.name}
                className={`flex gap-4 py-6 md:px-6 ${index % 2 === 0 ? 'md:border-r md:border-slate-200 md:pl-0 dark:md:border-slate-800' : ''} ${index > 1 ? 'border-t border-slate-200 dark:border-slate-800' : index === 1 ? 'border-t border-slate-200 md:border-t-0 dark:border-slate-800' : ''}`}
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${service.iconClass}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">{service.name}</h3>
                  <p className="mt-1 max-w-[48ch] text-sm leading-6 text-slate-600 dark:text-slate-300">{service.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
