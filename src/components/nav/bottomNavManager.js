/**
 * PawTube - Dynamic Liquid-Glass Bottom Navigation Manager
 * Accurately measures and animates the active tab pill across all screen sizes,
 * device rotations, safe-area inset changes, and font scaling without layout thrashing.
 */

class BottomNavManager {
  constructor() {
    this.nav = null;
    this.pill = null;
    this.items = [];
    this.activeRoute = '/home';
    this.rafId = null;
    this.isInitial = true;
    this.resizeObserver = null;
  }

  init() {
    this.nav = document.getElementById('bottom-nav');
    this.pill = document.getElementById('bnav-pill');
    if (!this.nav || !this.pill) return;

    this.items = Array.from(this.nav.querySelectorAll('.bnav-item'));

    // Handle clicks on items
    this.items.forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.getAttribute('data-route') || '/home';
        this.setActive(route);
      });
    });

    // Resize and orientation change handlers using requestAnimationFrame
    const onResize = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => this.updatePillPosition(false));
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    // Use ResizeObserver if available
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.nav);
    }

    // Initial position without bounce
    this.updatePillPosition(true);
  }

  setActive(route) {
    // Normalize route (e.g. /home, /shorts, /library, /you)
    let normalized = route || '/home';
    if (normalized.startsWith('#')) normalized = normalized.slice(1);
    const basePath = normalized.split('?')[0];

    // Find closest matching item
    let matchedItem = this.items.find((item) => {
      const itemRoute = item.getAttribute('data-route');
      return itemRoute === basePath;
    });

    // Fallback: default to /home if not found
    if (!matchedItem && basePath === '/') {
      matchedItem = this.items.find((i) => i.getAttribute('data-route') === '/home');
    }

    this.items.forEach((item) => {
      const isActive = item === matchedItem;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    this.activeRoute = basePath;
    this.updatePillPosition(this.isInitial);
  }

  updatePillPosition(immediate = false) {
    if (!this.nav || !this.pill) return;

    // If bottom nav is hidden (e.g. on desktop), skip
    if (getComputedStyle(this.nav).display === 'none') {
      return;
    }

    const activeItem = this.items.find((i) => i.classList.contains('active'));
    if (!activeItem) {
      this.pill.style.opacity = '0';
      return;
    }

    this.pill.style.opacity = '1';

    // Calculate position based on offset relative to .bottom-nav
    const left = activeItem.offsetLeft;
    const width = activeItem.offsetWidth;

    if (width === 0) {
      // Element might not be rendered yet, retry on next frame
      requestAnimationFrame(() => this.updatePillPosition(immediate));
      return;
    }

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (immediate || prefersReducedMotion) {
      this.pill.classList.add('no-transition');
      this.pill.style.width = `${width}px`;
      this.pill.style.transform = `translateX(${left}px)`;
      
      // Remove no-transition after render cycle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!prefersReducedMotion && this.pill) {
            this.pill.classList.remove('no-transition');
          }
        });
      });
    } else {
      this.pill.classList.remove('no-transition');
      this.pill.style.width = `${width}px`;
      this.pill.style.transform = `translateX(${left}px)`;
    }

    if (this.isInitial) {
      this.isInitial = false;
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }
}

export const bottomNavManager = new BottomNavManager();
export default bottomNavManager;
