import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '' },
  {
    path: 'how-it-works',
    loadComponent: () => import('./how-it-works/how-it-works.component').then((m) => m.HowItWorksComponent)
  }
];
