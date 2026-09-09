import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'how-it-works',
    loadComponent: () => import('./how-it-works/how-it-works.component').then((m) => m.HowItWorksComponent)
  }
];
