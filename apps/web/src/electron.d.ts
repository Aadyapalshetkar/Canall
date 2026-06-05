interface ElectronAPI {
  showNotification: (title: string, body: string) => void;
  onNotificationClick: (callback: () => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
