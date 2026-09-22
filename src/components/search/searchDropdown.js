/**
 * PawTube - Search Component & Suggestions Dropdown
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { extractVideoId } from '../../player/videoId.js';
import { recordSearchQuery } from '../../storage/personalization/personalizationEngine.js';
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
  let activeSuggestionIndex = -1;

  const closeDropdown = () => {
    if (dropdown) dropdown.style.display = 'none';
    activeSuggestionIndex = -1;
  };

  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

    clearTimeout(debounceTimer);
    if (!val) {
      closeDropdown();
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
          closeDropdown();
          if (headerCenter) headerCenter.classList.remove('mobile-active');
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
          closeDropdown();
          return;
        }

        activeSuggestionIndex = -1;
        dropdown.style.display = 'block';
        dropdown.innerHTML = list.slice(0, 8).map((s, idx) => `
          <div class="search-suggestion-item" data-index="${idx}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-secondary);">search</span>
            <span>${escapeHtml(s)}</span>
          </div>
        `).join('');

        dropdown.querySelectorAll('.search-suggestion-item').forEach((item, idx) => {
          item.onclick = () => {
            const chosen = list[idx];
            input.value = chosen;
            closeDropdown();
            if (headerCenter) headerCenter.classList.remove('mobile-active');
            recordSearchQuery(chosen);
            window.location.hash = `#/search?q=${encodeURIComponent(chosen)}`;
          };
        });
      } catch (err) {
        closeDropdown();
      }
    }, 220);
  });

  // Keyboard navigation for search input (ArrowUp, ArrowDown, Escape)
  input.addEventListener('keydown', (e) => {
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'Escape') closeDropdown();
      return;
    }

    const items = dropdown.querySelectorAll('.search-suggestion-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
      updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
      updateActiveSuggestion(items);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  });

  function updateActiveSuggestion(items) {
    items.forEach((item, idx) => {
      if (idx === activeSuggestionIndex) {
        item.style.background = 'rgba(255, 255, 255, 0.12)';
        input.value = item.querySelector('span:last-child').textContent;
      } else {
        item.style.background = 'transparent';
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      closeDropdown();
      input.focus();
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    closeDropdown();
    if (headerCenter) headerCenter.classList.remove('mobile-active');

    const directId = extractVideoId(query);
    if (directId) {
      window.location.hash = `#/watch?v=${encodeURIComponent(directId)}`;
      return;
    }

    recordSearchQuery(query);
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
      closeDropdown();
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !form.contains(e.target)) {
      closeDropdown();
    }
  });
}

export default initSearch;
