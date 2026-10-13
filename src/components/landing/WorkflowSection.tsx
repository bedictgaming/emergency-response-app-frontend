import { Camera, ClipboardCheck, MapPin } from 'lucide-react';

const steps = [
  {
    title: 'Describe what happened',
    description: 'Choose the needed services and add the incident details and contact information.',
    icon: ClipboardCheck,
  },
  {
    title: 'Confirm the place and photo',
    description: 'Select the Cordova barangay, confirm the map location, and attach a current photo.',
    icon: MapPin,
  },
  {
    title: 'Submit and track the report',
    description: 'The system checks the report and lets you follow its status from your account.',
    icon: Camera,
  },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="w-full border-y border-slate-200 bg-slate-50 py-16 sm:py-20 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">How reporting works</h2>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            The reporting flow keeps location, evidence, and status information together without exposing private incident details publicly.
          </p>
        </div>

        <ol className="mt-10 grid border-y border-slate-200 md:grid-cols-3 dark:border-slate-800">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className={`py-6 md:px-6 ${index > 0 ? 'border-t border-slate-200 md:border-t-0 md:border-l dark:border-slate-800' : 'md:pl-0'}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-red-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:ring-slate-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Step {index + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
