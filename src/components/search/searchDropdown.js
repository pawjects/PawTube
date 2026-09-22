/**
 * PawTube - Search Component & Suggestions Dropdown
 * Handles debounced auto-complete, keyboard navigation, local search history merging,
 * AbortController cancellation, and responsive mobile search mode.
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { extractVideoId } from '../../player/videoId.js';
import { recordSearchQuery, getRecentSearches } from '../../storage/personalization/personalizationEngine.js';
import { escapeHtml } from '../../utils/dom.js';
import { isAbortError } from '../../api/client/apiClient.js';

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
  let suggestionAbortController = null;
  let currentQuery = '';

  const closeDropdown = () => {
    if (dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
    activeSuggestionIndex = -1;
  };

  const executeSearch = (query) => {
    const clean = (query || '').trim();
    if (!clean) return;

    closeDropdown();
    if (headerCenter) headerCenter.classList.remove('mobile-active');

    // Direct YouTube video ID or URL check
    const directId = extractVideoId(clean);
    if (directId) {
      window.location.hash = `#/watch?v=${encodeURIComponent(directId)}`;
      return;
    }

    recordSearchQuery(clean);
    window.location.hash = `#/search?q=${encodeURIComponent(clean)}`;
  };

  const renderSuggestions = (items, queryVal) => {
    if (!dropdown || items.length === 0) {
      closeDropdown();
      return;
    }

    activeSuggestionIndex = -1;
    dropdown.style.display = 'block';

    dropdown.innerHTML = items.map((item, idx) => `
      <div class="search-suggestion-item" data-index="${idx}" data-val="${escapeHtml(item.text)}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;font-size:14px;color:var(--text-primary);transition:background 0.15s;border-bottom:1px solid var(--glass-border-light);">
        <div style="display:flex;align-items:center;gap:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <span class="material-symbols-rounded" style="font-size:18px;color:${item.isRecent ? 'var(--brand-blue)' : 'var(--text-secondary)'};flex-shrink:0;">
            ${item.isRecent ? 'history' : 'search'}
          </span>
          <span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.text)}</span>
        </div>
        ${item.isRecent ? '<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px;flex-shrink:0;">Recent</span>' : ''}
      </div>
    `).join('');

    dropdown.querySelectorAll('.search-suggestion-item').forEach((row) => {
      row.addEventListener('click', () => {
        const val = row.getAttribute('data-val');
        if (val) {
          input.value = val;
          executeSearch(val);
        }
      });
    });
  };

  input.addEventListener('input', () => {
    const val = input.value.trim();
    currentQuery = val;
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

    if (suggestionAbortController) {
      suggestionAbortController.abort();
      suggestionAbortController = null;
    }

    clearTimeout(debounceTimer);

    if (!val) {
      closeDropdown();
      return;
    }

    // Direct YouTube URL detection
    const directId = extractVideoId(val);
    if (directId) {
      if (dropdown) {
        dropdown.style.display = 'block';
        dropdown.innerHTML = `
          <div class="search-suggestion-item" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;color:var(--text-primary);">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:22px;">play_circle</span>
            <span>Direct Video: <strong>${escapeHtml(directId)}</strong></span>
          </div>
        `;
        dropdown.querySelector('.search-suggestion-item').onclick = () => {
          executeSearch(val);
        };
      }
      return;
    }

    // Combine matching local searches immediately for instant feedback
    const lowerVal = val.toLowerCase();
    const localMatches = getRecentSearches()
      .filter((q) => q.toLowerCase().includes(lowerVal) && q.toLowerCase() !== lowerVal)
      .slice(0, 3)
      .map((q) => ({ text: q, isRecent: true }));

    if (localMatches.length > 0) {
      renderSuggestions(localMatches, val);
    }

    // Debounce network suggestions by 220ms
    debounceTimer = setTimeout(async () => {
      if (currentQuery !== val) return;

      suggestionAbortController = new AbortController();
      try {
        const res = await PipedApi.getSuggestions(val, { signal: suggestionAbortController.signal });
        if (currentQuery !== val) return;

        const networkList = (res?.suggestions || [])
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .map((s) => ({ text: s, isRecent: false }));

        // Merge local matches with network suggestions without duplicates
        const seen = new Set();
        const combined = [];

        [...localMatches, ...networkList].forEach((item) => {
          const key = item.text.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(item);
          }
        });

        renderSuggestions(combined.slice(0, 8), val);
      } catch (err) {
        if (!isAbortError(err)) {
          // If network suggestions fail, keep local suggestions or close
          if (localMatches.length === 0) closeDropdown();
        }
      }
    }, 220);
  });

  // Keyboard navigation for suggestions
  input.addEventListener('keydown', (e) => {
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'Escape') closeDropdown();
      return;
    }

    const items = dropdown.querySelectorAll('.search-suggestion-item');
    if (items.length === 0) return;

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
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
        e.preventDefault();
        const chosenVal = items[activeSuggestionIndex].getAttribute('data-val');
        if (chosenVal) {
          input.value = chosenVal;
          executeSearch(chosenVal);
        }
      }
    }
  });

  function updateActiveSuggestion(items) {
    items.forEach((item, idx) => {
      const isSelected = idx === activeSuggestionIndex;
      item.style.background = isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent';
      if (isSelected) {
        const val = item.getAttribute('data-val');
        if (val) input.value = val;
      }
    });
  }

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      input.value = '';
      currentQuery = '';
      clearBtn.style.display = 'none';
      closeDropdown();
      input.focus();
    });
  }

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executeSearch(input.value);
  });

  // Mobile search expand / collapse
  if (mobileSearchTrigger && headerCenter) {
    mobileSearchTrigger.addEventListener('click', () => {
      headerCenter.classList.add('mobile-active');
      setTimeout(() => input.focus(), 50);
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
