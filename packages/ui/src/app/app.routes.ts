import { Routes } from '@angular/router';

export const routes: Routes = [
  // No component: AppComponent already renders this content directly and
  // permanently mounts <router-outlet> itself; this entry exists only so
  // '' resolves as a valid, matched route (Angular requires one of
  // component/loadComponent/redirectTo/children/loadChildren per route).
  { path: '', children: [] },
  {
    path: 'how-it-works',
    loadComponent: () => import('./how-it-works/how-it-works.component').then((m) => m.HowItWorksComponent)
  }
];
