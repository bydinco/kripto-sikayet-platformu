import type { ReportCategory, ReportStatus } from '../lib/api-models';

export interface Dictionary {
  siteName: string;
  nav: {
    home: string;
    entities: string;
    login: string;
    register: string;
    myReports: string;
    logout: string;
    submitReport: string;
  };
  footer: { disclaimer: string };
  home: {
    tagline: string;
    searchPlaceholder: string;
    searchButton: string;
    recentReportsTitle: string;
    noRecentReports: string;
  };
  entities: {
    title: string;
    searchPlaceholder: string;
    searchButton: string;
    empty: string;
    viewButton: string;
  };
  entityDetail: {
    statsTitle: string;
    responseRate: string;
    resolutionRate: string;
    avgSatisfaction: string;
    noData: string;
    reportsTitle: string;
    noReports: string;
  };
  reportDetail: {
    statusLabel: string;
    disputedBadge: string;
    evidenceTitle: string;
    noEvidence: string;
    responsesTitle: string;
    noResponses: string;
    satisfactionLabel: string;
    lossLabel: string;
    incidentDateLabel: string;
    categoryLabel: string;
  };
  reportForm: {
    title: string;
    entityLabel: string;
    entitySearchPlaceholder: string;
    noEntitySelected: string;
    categoryLabel: string;
    titleLabel: string;
    bodyLabel: string;
    lossLabel: string;
    incidentDateLabel: string;
    evidenceTitle: string;
    addEvidence: string;
    removeEvidence: string;
    evidenceTypeLabel: string;
    evidenceValueLabel: string;
    submit: string;
    submitting: string;
    loginRequired: string;
    goToLogin: string;
    success: string;
    viewReport: string;
  };
  myReports: { title: string; empty: string };
  auth: {
    loginTitle: string;
    registerTitle: string;
    emailLabel: string;
    passwordLabel: string;
    handleLabel: string;
    submitLogin: string;
    submitRegister: string;
    noAccount: string;
    haveAccount: string;
  };
  statuses: Record<ReportStatus, string>;
  categories: Record<ReportCategory, string>;
  evidenceTypes: Record<'TX_HASH' | 'WALLET_ADDRESS' | 'LINK', string>;
}
