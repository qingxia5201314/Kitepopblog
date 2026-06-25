import { lazy } from 'react';

export const LazyHomePage = lazy(() => import('./HomePage').then((module) => ({ default: module.HomePage })));
export const LazyAccountingPage = lazy(() => import('./AccountingPage').then((module) => ({ default: module.AccountingPage })));
export const LazyFilesPage = lazy(() => import('./FilesPage').then((module) => ({ default: module.FilesPage })));
export const LazyImagesPage = lazy(() => import('./ImagesPage').then((module) => ({ default: module.ImagesPage })));
export const LazyAdminPage = lazy(() => import('./AdminPage').then((module) => ({ default: module.AdminPage })));
