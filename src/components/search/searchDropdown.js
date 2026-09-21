/**
 * PawTube - Search Component & Suggestions Dropdown
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { extractVideoId } from '../../player/videoId.js';
import { escapeHtml } from '../../utils/dom.js';

export function initSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('header-search');
  const clearBtn = document.getElementById('search-clear-btn');
  const dropdown = document.getElementById('search-suggestions-dropdown');
  const mobileSearchTrigger = document.getElementById('mobile-search-trigger');
  const mobileSearchBack = document.getElementById('mobile-search-back');
  const headerCenter = document.getElementById('header-center');

  if (!form || !input) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

    clearTimeout(debounceTimer);
    if (!val) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    // Check if user pasted a direct YouTube URL or video ID
    const directId = extractVideoId(val);
    if (directId) {
      if (dropdown) {
        dropdown.style.display = 'block';
        dropdown.innerHTML = `
          <div class="search-suggestion-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);">play_circle</span>
            <span>Watch Video: <strong>${escapeHtml(directId)}</strong></span>
          </div>
        `;
        dropdown.querySelector('.search-suggestion-item').onclick = () => {
          dropdown.style.display = 'none';
          window.location.hash = `#/watch?v=${encodeURIComponent(directId)}`;
        };
      }
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await PipedApi.getSuggestions(val);
        const list = res.suggestions || [];
        if (list.length === 0 || !dropdown) {
          if (dropdown) dropdown.style.display = 'none';
          return;
        }

        dropdown.style.display = 'block';
        dropdown.innerHTML = list.slice(0, 7).map((s) => `
          <div class="search-suggestion-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-secondary);">search</span>
            <span>${escapeHtml(s)}</span>
          </div>
        `).join('');

        dropdown.querySelectorAll('.search-suggestion-item').forEach((item, idx) => {
          item.onclick = () => {
            input.value = list[idx];
            dropdown.style.display = 'none';
            window.location.hash = `#/search?q=${encodeURIComponent(list[idx])}`;
          };
        });
      } catch (err) {
        if (dropdown) dropdown.style.display = 'none';
      }
    }, 250);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
      input.focus();
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    if (dropdown) dropdown.style.display = 'none';

    const directId = extractVideoId(query);
    if (directId) {
      window.location.hash = `#/watch?v=${encodeURIComponent(directId)}`;
      return;
    }

    window.location.hash = `#/search?q=${encodeURIComponent(query)}`;
  });

  // Mobile search expand/collapse
  if (mobileSearchTrigger && headerCenter) {
    mobileSearchTrigger.addEventListener('click', () => {
      headerCenter.classList.add('mobile-active');
      input.focus();
    });
  }

  if (mobileSearchBack && headerCenter) {
    mobileSearchBack.addEventListener('click', () => {
      headerCenter.classList.remove('mobile-active');
      if (dropdown) dropdown.style.display = 'none';
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !form.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

export default initSearch;
