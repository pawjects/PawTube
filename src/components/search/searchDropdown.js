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

let activeSuggestionIndex = -1;
let debounceTimer = null;
let suggestionAbortController = null;
let currentQuery = '';

export function closeDropdown() {
  const dropdown = document.getElementById('search-suggestions-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }
  activeSuggestionIndex = -1;
}

export function openMobileSearchUI() {
  const header = document.getElementById('header') || document.querySelector('.header');
  const headerCenter = document.getElementById('header-center');
  const input = document.getElementById('header-search');
  const clearBtn = document.getElementById('search-clear-btn');

  if (header) {
    header.classList.add('mobile-search-open');
  }
  if (headerCenter) {
    headerCenter.classList.add('mobile-active');
  }
  if (input) {
    input.focus();
    if (input.value.trim()) {
      input.select();
      if (clearBtn) clearBtn.style.display = 'flex';
    }
  }
}

export function closeMobileSearchUI() {
  const header = document.getElementById('header') || document.querySelector('.header');
  const headerCenter = document.getElementById('header-center');
  const input = document.getElementById('header-search');

  if (header) {
    header.classList.remove('mobile-search-open');
  }
  if (headerCenter) {
    headerCenter.classList.remove('mobile-active');
  }
  closeDropdown();
  if (input) {
    input.blur();
  }
}

export function submitSearch(query) {
  const clean = (query || '').trim();
  const input = document.getElementById('header-search');

  if (!clean) {
    if (input) input.focus();
    return;
  }

  // Close mobile search UI and suggestions
  closeMobileSearchUI();

  // Check direct video ID or YouTube URL
  const directId = extractVideoId(clean);
  if (directId) {
    window.location.hash = `#/watch?v=${encodeURIComponent(directId)}`;
    return;
  }

  // Record to recent searches
  recordSearchQuery(clean);

  // Sync input text
  if (input) {
    input.value = clean;
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'flex';
  }

  // Safe encoding with URLSearchParams
  const searchParams = new URLSearchParams();
  searchParams.set('q', clean);
  const targetHash = `#/search?${searchParams.toString()}`;

  if (window.location.hash === targetHash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = targetHash;
  }
}

export function initSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('header-search');
  const searchBtn = document.getElementById('search-btn');
  const clearBtn = document.getElementById('search-clear-btn');
  const dropdown = document.getElementById('search-suggestions-dropdown');
  const mobileSearchTrigger = document.getElementById('mobile-search-trigger');
  const mobileSearchBack = document.getElementById('mobile-search-back');

  if (!form || !input) return;

  // Prevent duplicate initialization
  if (form.dataset.initialized === 'true') return;
  form.dataset.initialized = 'true';

  const renderSuggestions = (items, queryVal) => {
    if (!dropdown || items.length === 0) {
      closeDropdown();
      return;
    }

    activeSuggestionIndex = -1;
    dropdown.style.display = 'block';
    dropdown.classList.add('open');

    dropdown.innerHTML = items.map((item, idx) => `
      <div class="search-suggestion-item" data-index="${idx}" data-val="${escapeHtml(item.text)}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;font-size:14px;color:var(--text-primary);transition:background 0.15s;border-bottom:1px solid var(--glass-border-light);touch-action:manipulation;">
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
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = row.getAttribute('data-val');
        if (val) {
          input.value = val;
          submitSearch(val);
        }
      };
      row.addEventListener('click', handleSelect);
      row.addEventListener('touchend', handleSelect);
    });
  };

  // Input typing listener
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

    // Direct YouTube URL detection preview
    const directId = extractVideoId(val);
    if (directId) {
      if (dropdown) {
        dropdown.style.display = 'block';
        dropdown.classList.add('open');
        dropdown.innerHTML = `
          <div class="search-suggestion-item direct-video-preview" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;color:var(--text-primary);touch-action:manipulation;">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:22px;">play_circle</span>
            <span>Direct Video: <strong>${escapeHtml(directId)}</strong></span>
          </div>
        `;
        const directRow = dropdown.querySelector('.direct-video-preview');
        if (directRow) {
          const handleDirect = (e) => {
            e.preventDefault();
            submitSearch(val);
          };
          directRow.addEventListener('click', handleDirect);
          directRow.addEventListener('touchend', handleDirect);
        }
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
          if (localMatches.length === 0) closeDropdown();
        }
      }
    }, 220);
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    const isDropdownVisible = dropdown && dropdown.style.display !== 'none';

    if (e.key === 'Enter') {
      if (isDropdownVisible) {
        const items = dropdown.querySelectorAll('.search-suggestion-item');
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
          e.preventDefault();
          const chosenVal = items[activeSuggestionIndex].getAttribute('data-val');
          if (chosenVal) {
            input.value = chosenVal;
            submitSearch(chosenVal);
            return;
          }
        }
      }
      e.preventDefault();
      submitSearch(input.value);
      return;
    }

    if (!isDropdownVisible) {
      if (e.key === 'Escape') {
        closeMobileSearchUI();
      }
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
    const handleClear = (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      currentQuery = '';
      clearBtn.style.display = 'none';
      closeDropdown();
      input.focus();
    };
    clearBtn.addEventListener('click', handleClear);
    clearBtn.addEventListener('touchend', handleClear);
  }

  // Form submit handler
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitSearch(input.value);
  });

  // Dedicated search button click & touch handlers
  if (searchBtn) {
    const handleSearchBtn = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = input.value.trim();
      if (val) {
        submitSearch(val);
      } else {
        input.focus();
      }
    };
    searchBtn.addEventListener('click', handleSearchBtn);
    searchBtn.addEventListener('touchend', handleSearchBtn);
  }

  // Mobile search trigger (open search UI)
  if (mobileSearchTrigger) {
    const handleTrigger = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMobileSearchUI();
    };
    mobileSearchTrigger.addEventListener('click', handleTrigger);
    mobileSearchTrigger.addEventListener('touchend', handleTrigger);
  }

  // Mobile search back (close search UI)
  if (mobileSearchBack) {
    const handleBack = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMobileSearchUI();
    };
    mobileSearchBack.addEventListener('click', handleBack);
    mobileSearchBack.addEventListener('touchend', handleBack);
  }

  // Close dropdown on outside click/touch
  const handleOutside = (e) => {
    if (dropdown && dropdown.style.display !== 'none') {
      if (!form.contains(e.target) && !dropdown.contains(e.target)) {
        closeDropdown();
      }
    }
  };
  document.addEventListener('click', handleOutside);
  document.addEventListener('touchstart', handleOutside, { passive: true });
}

export default initSearch;
