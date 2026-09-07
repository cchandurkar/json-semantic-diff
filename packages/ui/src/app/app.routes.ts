import { Routes } from '@angular/router';
import { AppComponent } from './app.component';

export const routes: Routes = [
  { path: '', component: AppComponent },
  {
    path: 'how-it-works',
    loadComponent: () => import('./how-it-works/how-it-works.component').then((m) => m.HowItWorksComponent)
  }
];
