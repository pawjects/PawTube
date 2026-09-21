/**
 * PawTube - Toast Notification Utility
 */

let toastElement = null;
let toastTimeout = null;

export function showToast(message, type = 'info', duration = 3000) {
  if (!toastElement) {
    toastElement = document.getElementById('toast');
    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.id = 'toast';
      toastElement.className = 'toast';
      document.body.appendChild(toastElement);
    }
  }

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastElement.textContent = message;
  toastElement.className = `toast show ${type}`;

  toastTimeout = setTimeout(() => {
    toastElement.className = 'toast';
  }, duration);
}

export default showToast;
