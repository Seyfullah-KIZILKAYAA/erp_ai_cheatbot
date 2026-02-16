/**
 * SETTINGS TYPES
 * Categorized settings for the ERP AI Chatbot
 */

export interface AppSettings {
  // Gorunum (Appearance)
  appearance: {
    theme: 'dark' | 'light';
  };

  // Dashboard
  dashboard: {
    showLivePanel: boolean;
    showBriefingCard: boolean;
  };

  // Veri Islemleri (Data Operations)
  dataOperations: {
    writeEnabled: boolean;
  };

  // Dosya Islemleri (File Operations)
  fileOperations: {
    uploadEnabled: boolean;
    maxFileSizeMB: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: {
    theme: 'dark',
  },
  dashboard: {
    showLivePanel: true,
    showBriefingCard: true,
  },
  dataOperations: {
    writeEnabled: false,
  },
  fileOperations: {
    uploadEnabled: true,
    maxFileSizeMB: 10,
  },
};

export const SETTINGS_KEY = 'erp_app_settings';
