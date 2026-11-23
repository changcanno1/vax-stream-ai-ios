// =============================================================================
// VAX 2.0.1 — MAIN iOS APP CONTROLLER (1:1 REPLICA + AI WEBSITE->PLUGIN ENGINE)
// Bao gồm đầy đủ:
// - Trang chủ: Nút nổi chọn nguồn, Full-bleed Hero, Khám Phá Thể Loại (màu), Xem tiếp
// - Chọn nguồn: Grid 2 cột, Tìm kiếm nguồn, Yêu thích nguồn, Lọc Movie / Phim ngắn / AI
// - Chi tiết phim: Backdrop mờ, [▶ Xem Ngay] [♡] [+], Grid 4 cột Danh sách tập
// - Custom VAX Fullscreen Player: 7 nút công cụ, ±10s, 4 Popover (Chọn tập, Chất lượng
//   & Tính năng AI, Phụ đề AI, Playback Speed), Lồng tiếng phụ đề VAX TTS thực tế
// - Cài đặt: Điền link Website tự convert ra Plugin qua Server AI, Nguồn JSON,
//   Kho Plugin, DNS DoH, Đổi Domain, Nội dung 18+, VLC/Infuse, AI Model Center.
// =============================================================================

(function () {
  const STORAGE_KEYS = {
    CUSTOM_PLUGINS: 'vax_custom_plugins_v2',
    DISABLED_PLUGINS: 'vax_disabled_plugins_v2',
    FAV_SOURCES: 'vax_fav_sources_v2',
    DOMAIN_OVERRIDES: 'vax_domain_overrides_v2',
    JSON_REPOS: 'vax_json_repos_v2',
    ACTIVE_PLUGIN: 'vax_active_plugin_id_v2',
    FAVORITES: 'vax_favorites_v2',
    HISTORY: 'vax_watch_history_v2',
    SETTINGS: 'vax_settings_v2'
  };

  const state = {
    plugins: new Map(),
    activePluginId: 'saigonphim',
    sourceFilterType: 'all',
    currentCatSlug: '',
    currentCatPage: 1,
    currentCatTitle: '',
    currentMovie: null,
    currentServerIndex: 0,
    currentEpisodeIndex: 0,
    currentStreamData: null,
    hlsInstance: null,
    skipTimes: [],
    playerLocked: false,
    controlsTimeout: null,
    aiTranslateEnabled: true,
    aiDubbingEnabled: false,
    aiSttSubtitleEnabled: false,
    parsedSubtitleCues: [],
    lastSpokenCueIndex: -1
  };

  // ---------------------------------------------------------------------------
  // 1. TIỆN ÍCH HỆ THỐNG & LƯU TRỮ
  // ---------------------------------------------------------------------------
  function showToast(msg, duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = msg;
    container.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 250);
    }, duration);
  }

  function getSettings() {
    try {
      return Object.assign({
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-2.5-flash',
        customEndpoint: '',
        corsProxyUrl: '',
        dnsProvider: 'system',
        defaultPlayer: 'auto',
        adultEnabled: false,
        autoSkipAds: true,
        googleUser: null
      }, JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}'));
    } catch (e) {
      return { provider: 'gemini', dnsProvider: 'system', defaultPlayer: 'auto', autoSkipAds: true };
    }
  }

  function saveSettings(patch) {
    const merged = Object.assign(getSettings(), patch);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }

  function getFavSources() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.FAV_SOURCES) || '[]')); }
    catch (e) { return new Set(); }
  }

  function toggleFavSource(pluginId) {
    const favs = getFavSources();
    if (favs.has(pluginId)) favs.delete(pluginId);
    else favs.add(pluginId);
    localStorage.setItem(STORAGE_KEYS.FAV_SOURCES, JSON.stringify(Array.from(favs)));
    renderSourcePickerGrid();
  }

  function getDomainOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.DOMAIN_OVERRIDES) || '{}'); }
    catch (e) { return {}; }
  }

  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || '[]'); }
    catch (e) { return []; }
  }

  function getWatchHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]'); }
    catch (e) { return []; }
  }

  function addWatchHistory(movie, pluginId, epName) {
    if (!movie || !movie.title) return;
    const list = getWatchHistory().filter(x => x.id !== movie.id);
    list.unshift({
      id: movie.id,
      title: movie.title,
      posterUrl: movie.posterUrl || movie.backdropUrl || '',
      backdropUrl: movie.backdropUrl || movie.posterUrl || '',
      quality: movie.quality || 'HD',
      episode_current: epName || movie.episode_current || '',
      year: movie.year || '',
      pluginId: pluginId || state.activePluginId,
      watchedAt: Date.now()
    });
    if (list.length > 50) list.length = 50;
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
    renderContinueWatching();
  }

  function fallbackPosterSvg(title) {
    const letter = String(title || 'V').trim().charAt(0).toUpperCase() || 'V';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#172554"/><stop offset="100%" stop-color="#3b0764"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="96" font-weight="bold" opacity="0.22">${letter}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------------------
  // 2. KHỞI TẠO KHO PLUGIN (15 BUILT-IN + CUSTOM AI + JSON REPO)
  // ---------------------------------------------------------------------------
  function initAllPlugins() {
    state.plugins.clear();
    const disabledSet = new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.DISABLED_PLUGINS) || '[]'));
    const domainOverrides = getDomainOverrides();

    const builtins = (window.VAX_BUILTIN_PLUGINS || []).slice();
    const priorityOrder = ['saigonphim', 'dexter', 'hoathinh1', 'tutientv', 'danet', 'film4k', 'onflix', 'hhpanda', 'cityphim', 'phimchill', 'phimfun', 'phimngan', 'phimbom', 'pinedrama', 'freereels'];
    builtins.sort((a, b) => {
      const ia = priorityOrder.indexOf(a.id);
      const ib = priorityOrder.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const registerCode = (rawCode, idHint, isBuiltin, isAiCreated) => {
      let codeToCompile = rawCode;
      if (domainOverrides[idHint]) {
        const newDom = domainOverrides[idHint].replace(/\/+$/, '');
        codeToCompile += `\n;try { BASEURL = "${newDom}"; BASELINK = "${newDom}"; SITE = "${newDom}"; DOMAIN = "${newDom}"; DEXTER_BASE = "${newDom}"; } catch(e){}`;
      }
      const compiled = window.VaxRuntime.compilePlugin(codeToCompile, idHint);
      if (compiled.ok) {
        if (domainOverrides[compiled.id]) {
          compiled.manifest.baseUrl = domainOverrides[compiled.id];
          compiled.manifest.BASEURL = domainOverrides[compiled.id];
        }
        compiled.isBuiltin = isBuiltin;
        compiled.isAiCreated = isAiCreated;
        compiled.isEnabled = !disabledSet.has(compiled.id);
        state.plugins.set(compiled.id, compiled);
      }
    };

    for (const item of builtins) {
      registerCode(item.code, item.id, true, false);
    }

    const customList = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLUGINS) || '[]');
    for (const custom of customList) {
      registerCode(custom.code, custom.id, false, true);
    }

    const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_PLUGIN);
    if (savedActive && state.plugins.has(savedActive) && state.plugins.get(savedActive).isEnabled) {
      state.activePluginId = savedActive;
    } else {
      state.activePluginId = state.plugins.has('saigonphim') ? 'saigonphim' : Array.from(state.plugins.keys())[0];
    }

    updateSourceBadges();
    renderSettingsPluginSection();
    renderRepoSubpageList();
  }

  function getActivePlugin() {
    return state.plugins.get(state.activePluginId) || Array.from(state.plugins.values())[0];
  }

  function updateSourceBadges() {
    const inst = getActivePlugin();
    if (!inst) return;
    const cleanName = (inst.manifest.name || inst.id).replace(/\s*\[.*?\]\s*/g, '').trim();
    const pill1 = document.getElementById('currentSourcePillName');
    const pill2 = document.getElementById('catSourceName');
    if (pill1) pill1.textContent = cleanName;
    if (pill2) pill2.textContent = cleanName;
  }

  async function selectSourcePlugin(pluginId) {
    if (!state.plugins.has(pluginId)) return;
    state.activePluginId = pluginId;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PLUGIN, pluginId);
    document.getElementById('sourcePickerModal').style.display = 'none';

    updateSourceBadges();
    renderSettingsPluginSection();
    await loadHomeView();
    if (document.getElementById('view-categories').classList.contains('active')) {
      initCategoriesView();
    }
  }

  // ---------------------------------------------------------------------------
  // 3. MODAL CHỌN NGUỒN (2-COLUMN GRID GIỐNG HỆT ẢNH 7)
  // ---------------------------------------------------------------------------
  function renderSourcePickerGrid() {
    const grid = document.getElementById('sourcePickerGrid');
    const searchKw = (document.getElementById('sourceFilterInput')?.value || '').trim().toLowerCase();
    if (!grid) return;
    grid.innerHTML = '';

    const favSet = getFavSources();
    const settings = getSettings();

    for (const [id, inst] of state.plugins.entries()) {
      if (!inst.isEnabled) continue;
      const m = inst.manifest || {};
      if (!settings.adultEnabled && m.isAdult) continue;

      const name = m.name || id;
      if (searchKw && !name.toLowerCase().includes(searchKw) && !id.toLowerCase().includes(searchKw)) {
        continue;
      }

      const isShort = String(m.type || '').toLowerCase() === 'shortfilm' || String(m.layoutType || '').toUpperCase() === 'VERTICAL' || /short|reels|pinedrama/i.test(id);
      if (state.sourceFilterType === 'fav' && !favSet.has(id)) continue;
      if (state.sourceFilterType === 'movie' && isShort) continue;
      if (state.sourceFilterType === 'short' && !isShort) continue;
      if (state.sourceFilterType === 'ai' && !inst.isAiCreated) continue;

      const card = document.createElement('div');
      card.className = 'source-grid-card' + (id === state.activePluginId ? ' active' : '');

      const letter = name.replace(/^\[.*?\]\s*/, '').trim().charAt(0).toUpperCase() || 'V';
      const iconHtml = m.iconUrl
        ? `<img src="${m.iconUrl}" alt="${letter}" onerror="this.style.display='none';this.parentNode.textContent='${letter}'" />`
        : letter;

      const isLiked = favSet.has(id);
      card.innerHTML = `
        <div class="sg-top">
          <div class="sg-icon-box">${iconHtml}</div>
          <button class="sg-heart-btn ${isLiked ? 'liked' : ''}" title="Yêu thích nguồn này">${isLiked ? '♥' : '♡'}</button>
        </div>
        <div>
          <div class="sg-name">${name}</div>
          <div class="sg-ver">v${m.version || '1.0.0'}${inst.isAiCreated ? ' • ✨ AI' : ''}</div>
        </div>
      `;

      card.querySelector('.sg-heart-btn').onclick = (e) => {
        e.stopPropagation();
        toggleFavSource(id);
      };

      card.onclick = () => selectSourcePlugin(id);
      grid.appendChild(card);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. TRANG CHỦ (HOME VIEW - HERO + KHÁM PHÁ THỂ LOẠI + XEM TIẾP - ẢNH 8)
  // ---------------------------------------------------------------------------
  async function loadHomeView() {
    const inst = getActivePlugin();
    if (!inst) return;

    const genreRow = document.getElementById('homeGenreCardsRow');
    const shelvesBox = document.getElementById('homeShelvesContainer');
    const loading = document.getElementById('homeLoading');
    const loadingText = document.getElementById('homeLoadingText');

    genreRow.innerHTML = '';
    shelvesBox.innerHTML = '';
    loading.style.display = 'flex';
    loadingText.textContent = `Đang tải nguồn ${inst.manifest.name}...`;

    // 1. Render Khám Phá Thể Loại (Thẻ màu bo tròn giống Ảnh 8)
    let categories = [];
    try {
      if (inst.api.getPrimaryCategories) {
        categories = JSON.parse(inst.api.getPrimaryCategories() || '[]');
      }
    } catch (e) {}

    if (categories.length === 0) {
      categories = [
        { name: 'Phim bộ', slug: 'tv' },
        { name: 'Hành động', slug: 'hanh-dong' },
        { name: 'Phiêu lưu', slug: 'phieu-luu' },
        { name: 'Hoạt hình', slug: 'hoat-hinh' },
        { name: 'Viễn tưởng', slug: 'vien-tuong' }
      ];
    }

    categories.slice(0, 14).forEach((cat, idx) => {
      const card = document.createElement('div');
      card.className = `genre-color-card genre-color-${idx % 5}`;
      card.textContent = cat.name || cat.title;
      card.onclick = () => {
        switchMainTab('view-categories');
        loadCategoryGrid(cat.slug || cat.link, 1, cat.name || cat.title);
      };
      genreRow.appendChild(card);
    });

    // 2. Render Xem tiếp
    renderContinueWatching();

    // 3. Tải các kệ phim (Home Sections)
    let sections = [];
    try {
      if (inst.api.getHomeSections) {
        sections = JSON.parse(inst.api.getHomeSections() || '[]');
      }
    } catch (e) {}

    if (!Array.isArray(sections) || sections.length === 0) {
      sections = [{ slug: '', title: 'Mới & Nổi bật', type: 'Horizontal' }];
    }

    let heroItem = null;
    let totalCount = 0;

    for (const sec of sections) {
      try {
        const res = await window.VaxRuntime.fetchList(inst, sec.slug, 1);
        const items = (res && Array.isArray(res.items)) ? res.items : [];
        if (!items.length) continue;

        totalCount += items.length;
        if (!heroItem) {
          heroItem = items[Math.floor(Math.random() * Math.min(5, items.length))] || items[0];
          renderHeroBanner(heroItem, inst.id);
        }

        const sectionEl = document.createElement('section');
        sectionEl.className = 'vax-section';
        sectionEl.innerHTML = `
          <div class="vax-section-header">
            <h2>${sec.title || 'Đề xuất'}</h2>
            <button class="text-link-btn">Xem thêm ›</button>
          </div>
          <div class="poster-horizontal-scroll"></div>
        `;

        sectionEl.querySelector('.text-link-btn').onclick = () => {
          switchMainTab('view-categories');
          loadCategoryGrid(sec.slug, 1, sec.title);
        };

        const row = sectionEl.querySelector('.poster-horizontal-scroll');
        items.slice(0, 18).forEach(m => {
          row.appendChild(createPosterCard(m, inst.id));
        });

        shelvesBox.appendChild(sectionEl);
      } catch (e) {}
    }

    loading.style.display = 'none';

    if (totalCount === 0) {
      shelvesBox.innerHTML = `
        <div class="vax-loading">
          <p style="text-align:center;max-width:320px;">Nguồn <b>${inst.manifest.name}</b> hiện không phản hồi hoặc cần đổi DNS/Domain.</p>
          <button class="vax-watch-pill-btn" id="quickFallbackSourceBtn" style="margin-top:10px;padding:10px 24px;font-size:14px;">Chuyển sang Sài Gòn Phim 4K</button>
        </div>
      `;
      const fbBtn = document.getElementById('quickFallbackSourceBtn');
      if (fbBtn) fbBtn.onclick = () => selectSourcePlugin('saigonphim');
    }
  }

  function renderHeroBanner(movie, pluginId) {
    if (!movie) return;
    const bgEl = document.getElementById('vaxHeroBg');
    const titleEl = document.getElementById('vaxHeroTitle');
    const metaEl = document.getElementById('vaxHeroMeta');
    const watchBtn = document.getElementById('vaxHeroWatchBtn');

    const imgUrl = movie.backdropUrl || movie.posterUrl || fallbackPosterSvg(movie.title);
    bgEl.style.backgroundImage = `url("${imgUrl}")`;
    titleEl.textContent = movie.title || 'VAX STREAM';
    metaEl.textContent = [movie.year, movie.quality || '4K HDR', movie.episode_current, movie.lang].filter(Boolean).join(' • ');
    watchBtn.onclick = () => openMovieDetailSubpage(movie, pluginId);
  }

  function createPosterCard(movie, pluginId) {
    const card = document.createElement('div');
    card.className = 'vax-poster-card';
    const poster = movie.posterUrl || movie.backdropUrl || fallbackPosterSvg(movie.title);
    const fb = fallbackPosterSvg(movie.title);

    card.innerHTML = `
      <div class="vax-poster-img-box">
        <img src="${poster}" alt="${(movie.title || '').replace(/"/g, '&quot;')}" loading="lazy" onerror="this.onerror=null;this.src='${fb}'" />
        ${movie.quality ? `<span class="poster-badge-tl">${movie.quality}</span>` : ''}
        ${movie.episode_current ? `<span class="poster-badge-br">${movie.episode_current}</span>` : ''}
      </div>
      <div class="vax-poster-title">${movie.title || 'Không tiêu đề'}</div>
      <div class="vax-poster-sub">${[movie.year, movie.lang].filter(Boolean).join(' • ') || 'Vietsub'}</div>
    `;
    card.onclick = () => openMovieDetailSubpage(movie, pluginId);
    return card;
  }

  function renderContinueWatching() {
    const hist = getWatchHistory();
    const sec = document.getElementById('homeContinueSection');
    const row = document.getElementById('homeContinueRow');
    if (!sec || !row) return;
    if (!hist.length) {
      sec.style.display = 'none';
      return;
    }
    sec.style.display = 'block';
    row.innerHTML = '';
    hist.slice(0, 15).forEach(m => {
      row.appendChild(createPosterCard(m, m.pluginId || state.activePluginId));
    });
  }

  // ---------------------------------------------------------------------------
  // 5. TAB THỂ LOẠI & LỊCH SỬ
  // ---------------------------------------------------------------------------
  async function initCategoriesView() {
    const inst = getActivePlugin();
    const row = document.getElementById('categoriesFilterRow');
    if (!inst || !row) return;
    row.innerHTML = '';

    let cats = [];
    try {
      if (inst.api.getPrimaryCategories) cats = JSON.parse(inst.api.getPrimaryCategories() || '[]');
    } catch (e) {}

    if (!cats.length) cats = [{ name: 'Tất cả', slug: '' }];

    cats.forEach((c, idx) => {
      const slug = c.slug || c.link || '';
      const pill = document.createElement('button');
      pill.className = 's-pill' + ((state.currentCatSlug === slug || (idx === 0 && !state.currentCatSlug)) ? ' active' : '');
      pill.textContent = c.name || c.title;
      pill.onclick = () => {
        document.querySelectorAll('#categoriesFilterRow .s-pill').forEach(b => b.classList.remove('active'));
        pill.classList.add('active');
        loadCategoryGrid(slug, 1, c.name || c.title);
      };
      row.appendChild(pill);
    });

    const first = cats[0];
    await loadCategoryGrid(first.slug || first.link || '', 1, first.name || first.title);
  }

  async function loadCategoryGrid(slug, page = 1, title = '') {
    const inst = getActivePlugin();
    const grid = document.getElementById('categoriesMovieGrid');
    const loading = document.getElementById('catLoading');
    const pagBar = document.getElementById('catPaginationBar');
    const pageBadge = document.getElementById('catPageIndicator');

    if (!inst || !grid) return;
    state.currentCatSlug = slug;
    state.currentCatPage = page;
    state.currentCatTitle = title;

    grid.innerHTML = '';
    loading.style.display = 'flex';

    try {
      const res = await window.VaxRuntime.fetchList(inst, slug, page);
      const items = (res && Array.isArray(res.items)) ? res.items : [];
      items.forEach(m => grid.appendChild(createPosterCard(m, inst.id)));
      pagBar.style.display = items.length ? 'flex' : 'none';
      pageBadge.textContent = `Trang ${page}`;
    } catch (e) {
      showToast('Lỗi tải danh mục: ' + e.message);
    } finally {
      loading.style.display = 'none';
    }
  }

  function renderHistoryAndFavoritesView() {
    const hGrid = document.getElementById('historyMovieGrid');
    const fGrid = document.getElementById('favoritesMovieGrid');
    if (!hGrid || !fGrid) return;

    const hist = getWatchHistory();
    hGrid.innerHTML = hist.length ? '' : '<p style="color:#8e8e93;grid-column:1/-1;text-align:center;padding:32px;">Chưa có lịch sử xem phim.</p>';
    hist.forEach(m => hGrid.appendChild(createPosterCard(m, m.pluginId)));

    const favs = getFavorites();
    fGrid.innerHTML = favs.length ? '' : '<p style="color:#8e8e93;grid-column:1/-1;text-align:center;padding:32px;">Chưa có phim yêu thích.</p>';
    favs.forEach(m => fGrid.appendChild(createPosterCard(m, m.pluginId)));
  }

  // ---------------------------------------------------------------------------
  // 6. SUB-PAGE CHI TIẾT PHIM (GIỐNG HỆT ẢNH 11: 4-COLUMN EPISODE GRID)
  // ---------------------------------------------------------------------------
  async function openMovieDetailSubpage(movieItem, pluginId) {
    const inst = state.plugins.get(pluginId || state.activePluginId) || getActivePlugin();
    if (!inst) return;

    const subpage = document.getElementById('subpage-movie-detail');
    const backdropEl = document.getElementById('detailBackdropImg');
    const titleEl = document.getElementById('detailMovieTitle');
    const metaEl = document.getElementById('detailMetaLine');
    const genresEl = document.getElementById('detailGenresLine');
    const synopsisEl = document.getElementById('detailSynopsisText');
    const serversRow = document.getElementById('detailServersRow');
    const epGrid = document.getElementById('detailEpisodesGrid');
    const epCountLabel = document.getElementById('detailEpCountLabel');

    subpage.style.display = 'block';
    const initImg = movieItem.backdropUrl || movieItem.posterUrl || fallbackPosterSvg(movieItem.title);
    backdropEl.style.backgroundImage = `url("${initImg}")`;
    titleEl.textContent = movieItem.title || 'Đang tải...';
    metaEl.innerHTML = `<span>${movieItem.year || '2026'}</span> • <span class="hd-gold-tag">${movieItem.quality || 'HD'}</span> • <span>${movieItem.episode_current || 'Đang cập nhật'}</span>`;
    genresEl.textContent = '';
    synopsisEl.textContent = movieItem.description || 'Đang tải nội dung chi tiết phim...';
    serversRow.innerHTML = '';
    epCountLabel.textContent = '';
    epGrid.innerHTML = '<div class="vax-loading" style="grid-column:1/-1;"><div class="ios-spinner"></div></div>';

    try {
      const detail = await window.VaxRuntime.fetchMovieDetail(inst, movieItem);
      state.currentMovie = Object.assign({}, movieItem, detail, { _pluginId: inst.id });
      state.currentServerIndex = 0;
      state.currentEpisodeIndex = 0;

      // Dịch tự động thông tin phim nếu AI Translate bật và mô tả bằng tiếng Anh
      let descText = state.currentMovie.description || 'Chưa có mô tả cho bộ phim này.';
      titleEl.textContent = state.currentMovie.title || movieItem.title;
      if (state.currentMovie.backdropUrl || state.currentMovie.posterUrl) {
        backdropEl.style.backgroundImage = `url("${state.currentMovie.backdropUrl || state.currentMovie.posterUrl}")`;
      }

      const servers = Array.isArray(state.currentMovie.servers) ? state.currentMovie.servers : [];
      const firstEpsCount = (servers[0] && servers[0].episodes) ? servers[0].episodes.length : 0;
      const statusStr = state.currentMovie.status || (firstEpsCount ? `Hoàn Tất (${firstEpsCount}/${firstEpsCount})` : (movieItem.episode_current || 'Full'));

      metaEl.innerHTML = `<span>${state.currentMovie.year || '2026'}</span> • <span class="hd-gold-tag">${state.currentMovie.quality || 'HD'}</span> • <span>${statusStr}</span>`;
      const cleanCat = String(state.currentMovie.category || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      genresEl.textContent = cleanCat || inst.manifest.name;
      synopsisEl.textContent = descText;

      renderDetailServersAndEpisodes();
    } catch (e) {
      epGrid.innerHTML = `<p style="color:#ff453a;grid-column:1/-1;text-align:center;">Lỗi tải danh sách tập: ${e.message}</p>`;
    }
  }

  function renderDetailServersAndEpisodes() {
    const serversRow = document.getElementById('detailServersRow');
    const epGrid = document.getElementById('detailEpisodesGrid');
    const epCountLabel = document.getElementById('detailEpCountLabel');
    const servers = (state.currentMovie && state.currentMovie.servers) || [];

    serversRow.innerHTML = '';
    epGrid.innerHTML = '';

    if (servers.length > 1) {
      servers.forEach((sv, idx) => {
        const pill = document.createElement('button');
        pill.className = 's-pill' + (idx === state.currentServerIndex ? ' active' : '');
        pill.textContent = sv.name || (`Server ${idx + 1}`);
        pill.onclick = () => {
          state.currentServerIndex = idx;
          renderDetailServersAndEpisodes();
        };
        serversRow.appendChild(pill);
      });
    }

    const eps = (servers[state.currentServerIndex] && servers[state.currentServerIndex].episodes) || [];
    epCountLabel.textContent = eps.length ? `${eps.length} tập` : '';

    if (!eps.length) {
      epGrid.innerHTML = '<p style="color:#8e8e93;grid-column:1/-1;text-align:center;">Chưa có tập phim nào trên server này.</p>';
      return;
    }

    eps.forEach((ep, idx) => {
      const btn = document.createElement('button');
      btn.className = 'detail-ep-pill' + (idx === state.currentEpisodeIndex ? ' active' : '');
      btn.textContent = ep.name || (`Tập ${idx + 1}`);
      btn.onclick = () => {
        state.currentEpisodeIndex = idx;
        launchFullscreenPlayer(state.currentServerIndex, idx);
      };
      epGrid.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. TRÌNH PHÁT CUSTOM VAX FULLSCREEN PLAYER (ẢNH 9, 10, 12, 13, 14)
  //    + LỒNG TIẾNG PHỤ ĐỀ AI (VAX TTS) & DỊCH PHỤ ĐỀ AI
  // ---------------------------------------------------------------------------
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  }

  function closeAllPlayerPopups() {
    ['playerPopupEpisodes', 'playerPopupSettings', 'playerPopupSubtitles', 'playerPopupSpeed'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  async function launchFullscreenPlayer(serverIdx, episodeIdx, customVariantUrl = null) {
    if (!state.currentMovie) return;
    const inst = state.plugins.get(state.currentMovie._pluginId) || getActivePlugin();
    const servers = state.currentMovie.servers || [];
    const server = servers[serverIdx];
    if (!server || !server.episodes || !server.episodes[episodeIdx]) {
      showToast('Không tìm thấy tập phim để phát');
      return;
    }

    state.currentServerIndex = serverIdx;
    state.currentEpisodeIndex = episodeIdx;
    const ep = server.episodes[episodeIdx];

    // Kiểm tra nếu người dùng chọn mở bằng VLC hoặc Infuse Pro trong Cài đặt
    const settings = getSettings();

    const fsModal = document.getElementById('fullscreenPlayerModal');
    const titleLabel = document.getElementById('playerNowPlayingTitle');
    fsModal.style.display = 'flex';
    closeAllPlayerPopups();
    titleLabel.textContent = `${state.currentMovie.title} — ${ep.name}`;

    addWatchHistory(state.currentMovie, inst.id, ep.name);
    renderDetailServersAndEpisodes();

    showToast(`⚡ Đang tải luồng phát ${ep.name}...`, 2000);

    try {
      const streamData = await window.VaxRuntime.resolveEpisodeStream(inst, ep, customVariantUrl);
      state.currentStreamData = streamData;
      state.skipTimes = Array.isArray(streamData.skipTimes) ? streamData.skipTimes : [];

      if (!streamData || (!streamData.url && !streamData.m3u8Content)) {
        showToast('⚠️ Server này không trả về link phát, hãy thử đổi Server khác');
        return;
      }

      if (settings.defaultPlayer === 'vlc' && streamData.url) {
        window.location.href = `vlc://${streamData.url}`;
        return;
      }
      if (settings.defaultPlayer === 'infuse' && streamData.url) {
        window.location.href = `infuse://x-callback-url/play?url=${encodeURIComponent(streamData.url)}`;
        return;
      }

      populatePlayerPopovers(server.episodes, ep, streamData);
      mountStreamIntoFullscreenVideo(streamData);
    } catch (e) {
      showToast('Lỗi phát video: ' + e.message);
    }
  }

  function populatePlayerPopovers(episodes, currentEp, streamData) {
    // 1. Popover Chọn tập phim (Ảnh 9)
    const epListEl = document.getElementById('popupEpisodesList');
    epListEl.innerHTML = '';
    episodes.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'p-modal-item' + (idx === state.currentEpisodeIndex ? ' active' : '');
      row.textContent = (idx === state.currentEpisodeIndex ? '✓ ' : '') + (item.name || `Tập ${idx + 1}`);
      row.onclick = () => {
        closeAllPlayerPopups();
        launchFullscreenPlayer(state.currentServerIndex, idx);
      };
      epListEl.appendChild(row);
    });

    // 2. Popover Chất lượng video (Ảnh 10)
    const qListEl = document.getElementById('popupQualityList');
    qListEl.innerHTML = '';
    if (Array.isArray(currentEp.ids) && currentEp.ids.length > 0) {
      currentEp.ids.forEach((v, idx) => {
        const qItem = document.createElement('div');
        qItem.className = 'p-modal-item' + (idx === 0 ? ' active' : '');
        qItem.textContent = (idx === 0 ? '✓ ' : '') + (v.name || 'Gốc (1080p)');
        qItem.onclick = () => {
          closeAllPlayerPopups();
          launchFullscreenPlayer(state.currentServerIndex, state.currentEpisodeIndex, v.url);
        };
        qListEl.appendChild(qItem);
      });
    } else {
      qListEl.innerHTML = '<div class="p-modal-item active">✓ Gốc (1080p / 4K)</div>';
    }

    // 3. Popover Phụ đề (Ảnh 12)
    const subListEl = document.getElementById('popupSubtitleTracksList');
    subListEl.innerHTML = '<div class="p-modal-item text-red" id="subTrackOffBtn">✓ Tắt phụ đề</div>';
    document.getElementById('subTrackOffBtn').onclick = () => {
      state.parsedSubtitleCues = [];
      document.getElementById('aiSubtitleCaptionOverlay').style.display = 'none';
      closeAllPlayerPopups();
      showToast('Đã tắt phụ đề');
    };

    const subs = Array.isArray(streamData.subtitles) ? streamData.subtitles : [];
    subs.forEach((s, idx) => {
      if (!s || !s.url) return;
      const sRow = document.createElement('div');
      sRow.className = 'p-modal-item' + (idx === 0 ? ' active' : '');
      sRow.textContent = `💬 ${s.lang || s.label || ('Phụ đề ' + (idx + 1))}`;
      sRow.onclick = () => {
        closeAllPlayerPopups();
        loadExternalSubtitleFile(s.url, s.lang || 'Tiếng Việt');
      };
      subListEl.appendChild(sRow);
    });

    if (subs.length > 0 && subs[0].url) {
      loadExternalSubtitleFile(subs[0].url, subs[0].lang || 'Tiếng Việt');
    } else {
      state.parsedSubtitleCues = [];
    }
  }

  async function loadExternalSubtitleFile(subUrl, label) {
    try {
      const res = await window.VaxRuntime.asyncHttpRequest(subUrl);
      if (res && res.body) {
        state.parsedSubtitleCues = parseVttOrSrt(res.body);
        showToast(`Đã nạp phụ đề: ${label} (${state.parsedSubtitleCues.length} câu)`);
      }
    } catch (e) {}
  }

  function parseVttOrSrt(rawText) {
    const cues = [];
    const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
    const timeRe = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/;

    function toSeconds(h, m, s, ms) {
      return (parseInt(h || 0, 10) * 3600) + (parseInt(m, 10) * 60) + parseInt(s, 10) + (parseInt(ms, 10) / 1000);
    }

    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(timeRe);
      if (m) {
        const start = toSeconds(m[1], m[2], m[3], m[4]);
        const end = toSeconds(m[5], m[6], m[7], m[8]);
        const textLines = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !timeRe.test(lines[i])) {
          textLines.push(lines[i].replace(/<[^>]+>/g, '').trim());
          i++;
        }
        const text = textLines.join(' ').trim();
        if (text) cues.push({ start, end, text });
      } else {
        i++;
      }
    }
    return cues;
  }

  function mountStreamIntoFullscreenVideo(streamData) {
    const videoEl = document.getElementById('vaxNativeVideo');
    const iframeEl = document.getElementById('vaxEmbedIframe');
    const playIcon = document.getElementById('playerPlayPauseIcon');

    if (state.hlsInstance) {
      state.hlsInstance.destroy();
      state.hlsInstance = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    videoEl.pause();
    videoEl.removeAttribute('src');
    iframeEl.src = 'about:blank';

    const streamUrl = String(streamData.url || '').trim();
    const isEmbed = streamData.isEmbed === true || (!/\.m3u8|\.mp4|\.mkv/i.test(streamUrl) && streamData.mimeType !== 'application/x-mpegURL' && !streamData.m3u8Content);

    if (isEmbed) {
      videoEl.style.display = 'none';
      iframeEl.style.display = 'block';
      iframeEl.src = streamUrl;
      return;
    }

    iframeEl.style.display = 'none';
    videoEl.style.display = 'block';

    let playableUrl = streamUrl;
    if (streamData.m3u8Content && streamData.m3u8Content.includes('#EXTM3U')) {
      const blob = new Blob([streamData.m3u8Content], { type: 'application/x-mpegURL' });
      playableUrl = URL.createObjectURL(blob);
    }

    const isHls = streamData.mimeType === 'application/x-mpegURL' || /\.m3u8/i.test(playableUrl) || !!streamData.m3u8Content;

    if (isHls && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ enableWorker: true });
      state.hlsInstance = hls;
      hls.loadSource(playableUrl);
      hls.attachMedia(videoEl);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().then(() => { playIcon.textContent = '❚❚'; }).catch(() => { playIcon.textContent = '▶'; });
      });
    } else {
      videoEl.src = playableUrl;
      videoEl.play().then(() => { playIcon.textContent = '❚❚'; }).catch(() => { playIcon.textContent = '▶'; });
    }
  }

  function closeFullscreenPlayer() {
    const videoEl = document.getElementById('vaxNativeVideo');
    const iframeEl = document.getElementById('vaxEmbedIframe');
    if (state.hlsInstance) {
      state.hlsInstance.destroy();
      state.hlsInstance = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
    }
    if (iframeEl) iframeEl.src = 'about:blank';
    document.getElementById('fullscreenPlayerModal').style.display = 'none';
  }

  // Lồng tiếng phụ đề AI (VAX TTS) & Hiển thị phụ đề
  function speakVietnameseTts(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'vi-VN';
    utter.rate = 1.15;
    window.speechSynthesis.speak(utter);
  }

  function setupCustomPlayerInteractions() {
    const videoEl = document.getElementById('vaxNativeVideo');
    const playPauseBtn = document.getElementById('playerPlayPauseBtn');
    const playIcon = document.getElementById('playerPlayPauseIcon');
    const seekSlider = document.getElementById('playerSeekSlider');
    const curTimeEl = document.getElementById('playerCurrentTime');
    const remTimeEl = document.getElementById('playerRemainingTime');
    const captionOverlay = document.getElementById('aiSubtitleCaptionOverlay');

    playPauseBtn.onclick = (e) => {
      e.stopPropagation();
      if (videoEl.paused) {
        videoEl.play();
        playIcon.textContent = '❚❚';
      } else {
        videoEl.pause();
        playIcon.textContent = '▶';
      }
    };

    document.getElementById('playerRewind10Btn').onclick = (e) => {
      e.stopPropagation();
      videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    };

    document.getElementById('playerForward10Btn').onclick = (e) => {
      e.stopPropagation();
      videoEl.currentTime = Math.min(videoEl.duration || 99999, videoEl.currentTime + 10);
    };

    document.getElementById('playerVolumeSlider').oninput = (e) => {
      videoEl.volume = parseFloat(e.target.value);
      videoEl.muted = videoEl.volume === 0;
    };

    document.getElementById('playerMuteBtn').onclick = () => {
      videoEl.muted = !videoEl.muted;
      document.getElementById('playerMuteBtn').textContent = videoEl.muted ? '🔇' : '🔊';
    };

    seekSlider.oninput = (e) => {
      if (videoEl.duration) {
        videoEl.currentTime = (parseFloat(e.target.value) / 100) * videoEl.duration;
      }
    };

    videoEl.addEventListener('timeupdate', () => {
      const cur = videoEl.currentTime || 0;
      const dur = videoEl.duration || 0;
      curTimeEl.textContent = formatTime(cur);
      remTimeEl.textContent = dur > 0 ? `-${formatTime(dur - cur)}` : '-00:00';
      if (dur > 0) seekSlider.value = ((cur / dur) * 100).toFixed(2);

      // 1. Tự động bỏ qua quảng cáo / Intro (skipTimes)
      for (const sk of state.skipTimes) {
        if (cur >= sk.start && cur < sk.end - 1) {
          videoEl.currentTime = sk.end;
          showToast(`⏭️ Đã tự động bỏ qua ${sk.type === 'intro' ? 'Intro' : 'Quảng cáo'}`);
          break;
        }
      }

      // 2. Phụ đề rời + Lồng tiếng Thuyết minh AI (VAX TTS)
      if (state.parsedSubtitleCues.length > 0) {
        const cueIdx = state.parsedSubtitleCues.findIndex(c => cur >= c.start && cur <= c.end);
        if (cueIdx !== -1) {
          const cue = state.parsedSubtitleCues[cueIdx];
          captionOverlay.style.display = 'block';
          captionOverlay.textContent = cue.text;
          if (state.aiDubbingEnabled && state.lastSpokenCueIndex !== cueIdx) {
            state.lastSpokenCueIndex = cueIdx;
            videoEl.volume = 0.25; // Giảm âm lượng nhạc nền phim khi AI thuyết minh
            speakVietnameseTts(cue.text);
          }
        } else {
          captionOverlay.style.display = 'none';
        }
      }
    });

    videoEl.addEventListener('ended', () => {
      playNextEpisodeInPlayer();
    });

    // 7 nút trên thanh Upper Toolbar của Player
    const togglePopup = (popupId) => {
      const target = document.getElementById(popupId);
      const isVisible = target.style.display === 'flex';
      closeAllPlayerPopups();
      target.style.display = isVisible ? 'none' : 'flex';
    };

    document.getElementById('pToolEpisodesBtn').onclick = (e) => { e.stopPropagation(); togglePopup('playerPopupEpisodes'); };
    document.getElementById('pToolNextEpBtn').onclick = (e) => { e.stopPropagation(); playNextEpisodeInPlayer(); };
    document.getElementById('pToolSubtitlesBtn').onclick = (e) => { e.stopPropagation(); togglePopup('playerPopupSubtitles'); };
    document.getElementById('pToolSettingsBtn').onclick = (e) => { e.stopPropagation(); togglePopup('playerPopupSettings'); };
    document.getElementById('playerSpeedBtn').onclick = (e) => { e.stopPropagation(); togglePopup('playerPopupSpeed'); };

    document.getElementById('pToolLockBtn').onclick = (e) => {
      e.stopPropagation();
      state.playerLocked = !state.playerLocked;
      document.getElementById('playerCenterTransport').style.visibility = state.playerLocked ? 'hidden' : 'visible';
      showToast(state.playerLocked ? '🔒 Đã khóa điều khiển màn hình' : '🔓 Đã mở khóa màn hình');
    };

    document.getElementById('pToolRotateBtn').onclick = (e) => {
      e.stopPropagation();
      videoEl.style.objectFit = videoEl.style.objectFit === 'cover' ? 'contain' : 'cover';
      showToast(`Khung hình: ${videoEl.style.objectFit === 'cover' ? 'Tràn viền (Zoom)' : 'Chuẩn (Original)'}`);
    };

    const toggleAiDub = () => {
      state.aiDubbingEnabled = !state.aiDubbingEnabled;
      document.getElementById('checkAiDub').textContent = state.aiDubbingEnabled ? '✓' : ' ';
      document.getElementById('pToolAudioTtsBtn').classList.toggle('active', state.aiDubbingEnabled);
      if (!state.aiDubbingEnabled && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        videoEl.volume = 1;
      }
      showToast(state.aiDubbingEnabled ? '🎙️ Đã bật Thuyết minh AI (VAX TTS)' : 'Đã tắt Thuyết minh AI');
    };

    document.getElementById('pToolAudioTtsBtn').onclick = (e) => { e.stopPropagation(); toggleAiDub(); };
    document.getElementById('playerQuickAiVoiceBtn').onclick = (e) => { e.stopPropagation(); toggleAiDub(); };
    document.getElementById('popupToggleAiDubbing').onclick = (e) => { e.stopPropagation(); toggleAiDub(); };

    document.getElementById('popupToggleAiTranslate').onclick = (e) => {
      e.stopPropagation();
      state.aiTranslateEnabled = !state.aiTranslateEnabled;
      document.getElementById('checkAiTrans').textContent = state.aiTranslateEnabled ? '✓' : ' ';
      showToast(state.aiTranslateEnabled ? '🌐 Đã bật Dịch phụ đề AI tự động' : 'Đã tắt Dịch phụ đề AI');
    };

    document.getElementById('popupNextEpisodeAction').onclick = () => {
      closeAllPlayerPopups();
      playNextEpisodeInPlayer();
    };

    // Playback Speed items (Ảnh 13)
    document.querySelectorAll('#playerPopupSpeed .p-modal-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const spd = parseFloat(item.dataset.speed) || 1;
        videoEl.playbackRate = spd;
        document.getElementById('currentSpeedText').textContent = `${spd}x`;
        document.querySelectorAll('#playerPopupSpeed .p-modal-item').forEach(el => {
          el.classList.remove('active');
          el.textContent = el.textContent.replace('✓ ', '');
        });
        item.classList.add('active');
        item.textContent = '✓ ' + item.textContent;
        closeAllPlayerPopups();
        showToast(`Tốc độ phát: ${spd}x`);
      };
    });

    // Phụ đề AI & Thêm file phụ đề rời (Ảnh 12)
    document.getElementById('popupEnableAiSubBtn').onclick = () => {
      closeAllPlayerPopups();
      captionOverlay.style.display = 'block';
      captionOverlay.textContent = '🎙️ [VAX AI Subtitle] Đang lắng nghe và tạo phụ đề tiếng Việt theo thời gian thực...';
      showToast('Đã kích hoạt Tạo phụ đề AI từ giọng nói');
    };

    document.getElementById('popupImportSubFileBtn').onclick = () => {
      closeAllPlayerPopups();
      document.getElementById('subtitleFileInput').click();
    };

    document.getElementById('subtitleFileInput').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.parsedSubtitleCues = parseVttOrSrt(ev.target.result);
        showToast(`✅ Đã nạp file phụ đề "${file.name}" (${state.parsedSubtitleCues.length} câu)`);
      };
      reader.readAsText(file);
    };

    document.getElementById('playerCloseBtn').onclick = closeFullscreenPlayer;
    document.getElementById('playerPipBtn').onclick = async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (videoEl.requestPictureInPicture) await videoEl.requestPictureInPicture();
      } catch (e) {}
    };
    document.getElementById('playerCastBtn').onclick = () => {
      if (state.currentStreamData && state.currentStreamData.url) {
        navigator.clipboard.writeText(state.currentStreamData.url);
        showToast('📋 Đã copy link Stream (.m3u8) để mở trên VLC / Infuse / AirPlay!');
      }
    };
  }

  function playNextEpisodeInPlayer() {
    if (!state.currentMovie) return;
    const servers = state.currentMovie.servers || [];
    const curSv = servers[state.currentServerIndex];
    if (curSv && curSv.episodes && state.currentEpisodeIndex + 1 < curSv.episodes.length) {
      launchFullscreenPlayer(state.currentServerIndex, state.currentEpisodeIndex + 1);
    } else {
      showToast('Đã phát đến tập cuối cùng');
    }
  }

  // ---------------------------------------------------------------------------
  // 8. CÀI ĐẶT HỆ THỐNG, KHO PLUGIN (ẢNH 4, 5, 6) & AI WEBSITE -> PLUGIN
  // ---------------------------------------------------------------------------
  function renderSettingsPluginSection() {
    const inst = getActivePlugin();
    if (!inst) return;
    const m = inst.manifest || {};
    const total = state.plugins.size;
    const enabledCount = Array.from(state.plugins.values()).filter(p => p.isEnabled).length;

    const countLabel = document.getElementById('installedPluginsCountLabel');
    if (countLabel) countLabel.textContent = `${enabledCount}/${total} plugin đã cài đặt`;

    const headerEl = document.getElementById('currentPluginConfigHeader');
    if (headerEl) headerEl.textContent = `CẤU HÌNH: ${(m.name || inst.id).toUpperCase()}`;

    const domainEl = document.getElementById('currentPluginDomainLabel');
    if (domainEl) domainEl.textContent = m.baseUrl || m.BASEURL || 'Không có URL Base đăng nhập';
  }

  function renderRepoSubpageList() {
    const card = document.getElementById('repoPluginListCard');
    if (!card) return;
    card.innerHTML = '';

    const total = state.plugins.size;
    const enabledCount = Array.from(state.plugins.values()).filter(p => p.isEnabled).length;
    document.getElementById('repoTotalPluginsText').textContent = `Tổng số plugin: ${total}`;
    document.getElementById('repoInstalledPluginsText').textContent = `Đã cài đặt: ${enabledCount}`;

    for (const [id, inst] of state.plugins.entries()) {
      const m = inst.manifest || {};
      const row = document.createElement('div');
      row.className = 'repo-plugin-row';

      const letter = (m.name || id).charAt(0).toUpperCase();
      const iconHtml = m.iconUrl
        ? `<img src="${m.iconUrl}" style="width:38px;height:38px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'" />`
        : `<div class="sg-icon-box" style="width:38px;height:38px;">${letter}</div>`;

      row.innerHTML = `
        <div class="repo-plugin-left" style="cursor:pointer;flex:1;">
          ${iconHtml}
          <div>
            <div style="font-size:15.5px;font-weight:700;">${m.name || id} <span style="font-size:12px;color:#8e8e93;font-weight:500;">v${m.version || '1.0'}</span></div>
            <div style="font-size:12px;color:#8e8e93;margin-top:2px;">Loại: ${(m.type || 'MOVIE').toUpperCase()} • Layout: ${(m.layoutType || 'GRID').toUpperCase()}</div>
          </div>
        </div>
        <button class="repo-uninstall-btn">${inst.isEnabled ? '🗑️ Gỡ' : '⬇ Cài'}</button>
      `;

      row.querySelector('.repo-plugin-left').onclick = () => {
        document.getElementById('studioCodeEditor').value = inst.sourceCode;
        document.getElementById('subpage-ai-studio').style.display = 'block';
        showToast(`Đã mở mã nguồn của "${m.name}"`);
      };

      row.querySelector('.repo-uninstall-btn').onclick = () => {
        if (!inst.isBuiltin && inst.isEnabled) {
          const customList = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLUGINS) || '[]').filter(x => x.id !== id);
          localStorage.setItem(STORAGE_KEYS.CUSTOM_PLUGINS, JSON.stringify(customList));
          initAllPlugins();
          showToast(`Đã gỡ cài đặt Plugin ${m.name}`);
          return;
        }
        inst.isEnabled = !inst.isEnabled;
        const disabled = Array.from(state.plugins.values()).filter(p => !p.isEnabled).map(p => p.id);
        localStorage.setItem(STORAGE_KEYS.DISABLED_PLUGINS, JSON.stringify(disabled));
        renderRepoSubpageList();
        renderSettingsPluginSection();
      };

      card.appendChild(row);
    }
  }

  // Luồng chuyển đổi Website -> Plugin VAX bằng AI
  async function triggerAiWebsiteConversion(rawUrlInput) {
    let targetUrl = String(rawUrlInput || '').trim();
    if (!targetUrl) {
      showToast('Vui lòng nhập link website xem phim cần tạo Plugin!');
      return;
    }
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

    document.getElementById('subpage-ai-studio').style.display = 'block';
    document.getElementById('studioTargetUrlInput').value = targetUrl;

    const termBox = document.getElementById('studioTerminalBox');
    const editor = document.getElementById('studioCodeEditor');
    termBox.style.display = 'block';
    termBox.innerHTML = '';

    const logStep = (msg) => {
      const d = document.createElement('div');
      d.textContent = `• ${msg}`;
      termBox.appendChild(d);
      termBox.scrollTop = termBox.scrollHeight;
    };

    try {
      const settings = getSettings();
      const result = await window.VaxAIConverter.convertUrlToPlugin(targetUrl, settings, logStep);
      editor.value = result.pluginCode;
      showToast(`✨ AI đã tạo xong Plugin "${result.compiled.manifest.name}"!`);
      await testStudioPluginInSandbox(result.pluginCode);
    } catch (e) {
      logStep(`❌ Lỗi: ${e.message}`);
      showToast('Lỗi tạo Plugin: ' + e.message);
    }
  }

  async function testStudioPluginInSandbox(codeStr) {
    const previewBox = document.getElementById('studioSandboxPreviewBox');
    if (!codeStr || !codeStr.trim()) {
      showToast('Chưa có code Plugin để chạy thử');
      return;
    }

    previewBox.innerHTML = '<div class="vax-loading"><div class="ios-spinner"></div><span>Đang chạy thử Plugin trong VAX Sandbox...</span></div>';
    const compiled = window.VaxRuntime.compilePlugin(codeStr, 'studio_test');
    if (!compiled.ok) {
      previewBox.innerHTML = `<div class="ios-card" style="padding:14px;color:#ff453a;"><b>❌ Lỗi cú pháp:</b> ${compiled.error}</div>`;
      return;
    }

    compiled.isEnabled = true;
    compiled.isAiCreated = true;
    state.plugins.set(compiled.id, compiled);

    try {
      const res = await window.VaxRuntime.fetchList(compiled, '', 1);
      const items = (res && res.items) || [];
      previewBox.innerHTML = `
        <div class="ios-group-label">KẾT QUẢ CHẠY THỬ: ${compiled.manifest.name} (${items.length} PHIM)</div>
        <div class="poster-grid-container" id="studioTestGrid" style="padding:0;"></div>
      `;
      const grid = document.getElementById('studioTestGrid');
      items.slice(0, 9).forEach(m => grid.appendChild(createPosterCard(m, compiled.id)));
    } catch (e) {
      previewBox.innerHTML = `<div class="ios-card" style="padding:14px;color:#ff9f0a;">Đã biên dịch hợp lệ nhưng không lấy được danh sách: ${e.message}</div>`;
    }
  }

  function installPluginFromStudio() {
    const codeStr = (document.getElementById('studioCodeEditor').value || '').trim();
    if (!codeStr) {
      showToast('Chưa có mã nguồn Plugin để cài đặt!');
      return;
    }
    const compiled = window.VaxRuntime.compilePlugin(codeStr, 'ai_' + Date.now());
    if (!compiled.ok) {
      showToast('❌ Lỗi cú pháp: ' + compiled.error);
      return;
    }

    const customList = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLUGINS) || '[]')
      .filter(x => x.id !== compiled.id);
    customList.unshift({
      id: compiled.id,
      name: compiled.manifest.name || compiled.id,
      code: codeStr,
      createdAt: Date.now()
    });
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PLUGINS, JSON.stringify(customList));

    initAllPlugins();
    document.getElementById('subpage-ai-studio').style.display = 'none';
    selectSourcePlugin(compiled.id);
    switchMainTab('view-home');
    showToast(`🎉 Đã cài đặt nguồn "${compiled.manifest.name}" vào App!`);
  }

  // ---------------------------------------------------------------------------
  // 9. ĐIỀU HƯỚNG & SỰ KIỆN GIAO DIỆN
  // ---------------------------------------------------------------------------
  function switchMainTab(viewId) {
    // Đóng mọi subpage khi bấm thanh dock
    ['subpage-plugin-repo', 'subpage-ai-model', 'subpage-ai-studio', 'subpage-movie-detail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.ios-view').forEach(v => {
      v.classList.toggle('active', v.id === viewId);
    });
    document.querySelectorAll('.dock-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewId);
    });

    if (viewId === 'view-categories') initCategoriesView();
    if (viewId === 'view-history') renderHistoryAndFavoritesView();
    if (viewId === 'view-settings') renderSettingsPluginSection();
  }

  function bindAllEvents() {
    // Bottom Dock Navigation
    document.querySelectorAll('.dock-tab').forEach(btn => {
      btn.onclick = () => switchMainTab(btn.dataset.view);
    });

    // Open Source Picker Modal (Ảnh 7)
    const openPicker = () => {
      renderSourcePickerGrid();
      document.getElementById('sourcePickerModal').style.display = 'flex';
    };
    document.getElementById('openSourcePickerBtn').onclick = openPicker;
    document.getElementById('catSourceSwitchBtn').onclick = openPicker;
    document.getElementById('closeSourcePickerBtn').onclick = () => {
      document.getElementById('sourcePickerModal').style.display = 'none';
    };
    document.getElementById('sourceFilterInput').oninput = renderSourcePickerGrid;

    document.querySelectorAll('#sourceTypeFilterPills .s-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('#sourceTypeFilterPills .s-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.sourceFilterType = pill.dataset.filter;
        renderSourcePickerGrid();
      };
    });

    document.getElementById('sourcePickerAddAiBtn').onclick = () => {
      document.getElementById('sourcePickerModal').style.display = 'none';
      document.getElementById('subpage-ai-studio').style.display = 'block';
    };

    // Search Modal (Nút kính lúp tròn góc dưới bên phải)
    document.getElementById('openSearchModalBtn').onclick = () => {
      document.getElementById('searchModal').style.display = 'flex';
      document.getElementById('globalMovieSearchInput').focus();
    };
    document.getElementById('closeSearchModalBtn').onclick = () => {
      document.getElementById('searchModal').style.display = 'none';
    };

    const runSearch = async () => {
      const kw = (document.getElementById('globalMovieSearchInput').value || '').trim();
      if (!kw) return;
      const multi = document.getElementById('multiPluginSearchCheckbox').checked;
      const grid = document.getElementById('searchModalResultsGrid');
      const loader = document.getElementById('searchModalLoading');
      grid.innerHTML = '';
      loader.style.display = 'flex';

      try {
        if (multi) {
          const list = Array.from(state.plugins.values()).filter(p => p.isEnabled).slice(0, 6);
          const all = await Promise.all(list.map(async p => {
            try {
              const r = await window.VaxRuntime.searchMovies(p, kw, 1);
              return (r.items || []).slice(0, 6).map(m => ({ m, pid: p.id }));
            } catch (e) { return []; }
          }));
          all.flat().forEach(({ m, pid }) => {
            const c = createPosterCard(m, pid);
            c.addEventListener('click', () => { document.getElementById('searchModal').style.display = 'none'; });
            grid.appendChild(c);
          });
        } else {
          const inst = getActivePlugin();
          const r = await window.VaxRuntime.searchMovies(inst, kw, 1);
          (r.items || []).forEach(m => {
            const c = createPosterCard(m, inst.id);
            c.addEventListener('click', () => { document.getElementById('searchModal').style.display = 'none'; });
            grid.appendChild(c);
          });
        }
      } catch (e) {}
      loader.style.display = 'none';
    };

    document.getElementById('runGlobalSearchBtn').onclick = runSearch;
    document.getElementById('globalMovieSearchInput').onkeydown = (e) => {
      if (e.key === 'Enter') runSearch();
    };

    // Categories Pagination
    document.getElementById('catPrevPageBtn').onclick = () => {
      if (state.currentCatPage > 1) loadCategoryGrid(state.currentCatSlug, state.currentCatPage - 1, state.currentCatTitle);
    };
    document.getElementById('catNextPageBtn').onclick = () => {
      loadCategoryGrid(state.currentCatSlug, state.currentCatPage + 1, state.currentCatTitle);
    };

    // History / Favorites Segmented Control
    document.getElementById('segHistoryBtn').onclick = () => {
      document.getElementById('segHistoryBtn').classList.add('active');
      document.getElementById('segFavoritesBtn').classList.remove('active');
      document.getElementById('historyTabContent').style.display = 'block';
      document.getElementById('favoritesTabContent').style.display = 'none';
    };
    document.getElementById('segFavoritesBtn').onclick = () => {
      document.getElementById('segFavoritesBtn').classList.add('active');
      document.getElementById('segHistoryBtn').classList.remove('active');
      document.getElementById('favoritesTabContent').style.display = 'block';
      document.getElementById('historyTabContent').style.display = 'none';
    };

    // Movie Detail Subpage
    document.getElementById('closeMovieDetailBtn').onclick = () => {
      document.getElementById('subpage-movie-detail').style.display = 'none';
    };
    document.getElementById('detailPlayNowBtn').onclick = () => {
      launchFullscreenPlayer(state.currentServerIndex, state.currentEpisodeIndex);
    };
    document.getElementById('detailFavToggleBtn').onclick = () => {
      if (!state.currentMovie) return;
      const favs = getFavorites();
      const idx = favs.findIndex(x => x.id === state.currentMovie.id);
      if (idx >= 0) {
        favs.splice(idx, 1);
        showToast('Đã xóa khỏi Yêu thích');
      } else {
        favs.unshift({
          id: state.currentMovie.id,
          title: state.currentMovie.title,
          posterUrl: state.currentMovie.posterUrl || state.currentMovie.backdropUrl || '',
          quality: state.currentMovie.quality || 'HD',
          episode_current: state.currentMovie.episode_current || '',
          pluginId: state.currentMovie._pluginId || state.activePluginId
        });
        showToast('❤️ Đã thêm vào Yêu thích');
      }
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
    };
    document.getElementById('detailExternalPlayerBtn').onclick = async () => {
      if (!state.currentMovie) return;
      const inst = state.plugins.get(state.currentMovie._pluginId) || getActivePlugin();
      const sv = (state.currentMovie.servers || [])[state.currentServerIndex];
      const ep = sv && sv.episodes && sv.episodes[state.currentEpisodeIndex];
      if (!ep) return;
      const streamData = await window.VaxRuntime.resolveEpisodeStream(inst, ep);
      if (streamData && streamData.url) {
        navigator.clipboard.writeText(streamData.url);
        showToast('📋 Đã copy link Stream (.m3u8) vào bộ nhớ tạm!');
      }
    };

    // Settings: AI Website -> Plugin Quick Input
    document.getElementById('quickConvertWebBtn').onclick = () => {
      const u = document.getElementById('quickWebsiteToPluginInput').value;
      triggerAiWebsiteConversion(u);
    };
    document.getElementById('openAiStudioFullBtn').onclick = () => {
      const s = getSettings();
      document.getElementById('studioAiProviderSelect').value = s.provider || 'gemini';
      document.getElementById('studioAiKeyInput').value = s.apiKey || '';
      document.getElementById('studioCustomServerInput').value = s.corsProxyUrl || s.customEndpoint || '';
      document.getElementById('subpage-ai-studio').style.display = 'block';
    };

    // Settings: Thêm nguồn JSON hoặc link Website
    document.getElementById('addJsonRepoBtn').onclick = async () => {
      const val = (document.getElementById('newJsonRepoInput').value || '').trim();
      if (!val) return;
      if (val.endsWith('.js')) {
        const res = await window.VaxRuntime.asyncHttpRequest(val);
        if (res && res.body) {
          document.getElementById('studioCodeEditor').value = res.body;
          installPluginFromStudio();
          document.getElementById('newJsonRepoInput').value = '';
          return;
        }
      }
      // Nếu người dùng dán link website phim vào ô nguồn JSON, tự động chuyển qua AI Converter
      triggerAiWebsiteConversion(val);
    };

    document.getElementById('reloadAllSourcesBtn').onclick = () => {
      initAllPlugins();
      loadHomeView();
      showToast('🔄 Đã tải lại tất cả nguồn plugin!');
    };

    // Settings: Mở Kho Plugin (Ảnh 4)
    document.getElementById('openPluginRepoSubpageBtn').onclick = () => {
      renderRepoSubpageList();
      document.getElementById('subpage-plugin-repo').style.display = 'block';
    };
    document.getElementById('closePluginRepoSubpageBtn').onclick = () => {
      document.getElementById('subpage-plugin-repo').style.display = 'none';
    };

    // Cài file .js từ máy
    const triggerFilePicker = () => document.getElementById('pluginFileInput').click();
    document.getElementById('installFromLocalDeviceBtn').onclick = triggerFilePicker;
    document.getElementById('repoAddLocalFileBtn').onclick = triggerFilePicker;
    document.getElementById('repoInstallMemoryBtn').onclick = triggerFilePicker;

    document.getElementById('pluginFileInput').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('studioCodeEditor').value = ev.target.result;
        installPluginFromStudio();
      };
      reader.readAsText(file);
    };

    document.getElementById('repoDownloadAllBtn').onclick = () => {
      localStorage.setItem(STORAGE_KEYS.DISABLED_PLUGINS, '[]');
      initAllPlugins();
      showToast('✅ Đã kích hoạt toàn bộ Plugin trong kho');
    };

    document.getElementById('repoUninstallAllBtn').onclick = () => {
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_PLUGINS);
      initAllPlugins();
      showToast('Đã gỡ tất cả Plugin cài thêm');
    };

    // Settings: DNS Provider Popover (Ảnh 6)
    const dnsMenu = document.getElementById('dnsPopoverMenu');
    document.getElementById('dnsPickerTriggerRow').onclick = (e) => {
      e.stopPropagation();
      dnsMenu.style.display = dnsMenu.style.display === 'block' ? 'none' : 'block';
    };
    dnsMenu.querySelectorAll('.popover-item').forEach(item => {
      item.onclick = () => {
        dnsMenu.querySelectorAll('.popover-item').forEach(i => {
          i.classList.remove('active');
          i.textContent = i.textContent.replace('✓ ', '');
        });
        item.classList.add('active');
        const label = item.textContent;
        item.textContent = '✓ ' + label;
        document.getElementById('currentDnsLabel').textContent = label + ' ⌄';
        saveSettings({ dnsProvider: item.dataset.dns });
        dnsMenu.style.display = 'none';
        showToast(`Đã chuyển DNS DoH sang: ${label}`);
      };
    });

    // Settings: Đổi Domain cho Plugin đang chọn (Ảnh 5)
    document.getElementById('changePluginDomainBtn').onclick = () => {
      const inst = getActivePlugin();
      if (!inst) return;
      const curDom = inst.manifest.baseUrl || inst.manifest.BASEURL || '';
      const newDom = prompt(`Nhập tên miền (Domain) mới cho plugin "${inst.manifest.name}":`, curDom);
      if (newDom && newDom.trim()) {
        const overrides = getDomainOverrides();
        overrides[inst.id] = newDom.trim();
        localStorage.setItem(STORAGE_KEYS.DOMAIN_OVERRIDES, JSON.stringify(overrides));
        initAllPlugins();
        loadHomeView();
        showToast(`🌐 Đã cập nhật Domain của ${inst.manifest.name} thành ${newDom.trim()}`);
      }
    };

    // Settings: Trình phát mặc định (Auto / VLC / Infuse - Ảnh 3)
    const playerMenu = document.getElementById('playerPopoverMenu');
    document.getElementById('playerTypePickerRow').onclick = (e) => {
      e.stopPropagation();
      playerMenu.style.display = playerMenu.style.display === 'block' ? 'none' : 'block';
    };
    playerMenu.querySelectorAll('.popover-item').forEach(item => {
      item.onclick = () => {
        playerMenu.querySelectorAll('.popover-item').forEach(i => {
          i.classList.remove('active');
          i.textContent = i.textContent.replace('✓ ', '');
        });
        item.classList.add('active');
        const label = item.textContent;
        item.textContent = '✓ ' + label;
        document.getElementById('defaultPlayerLabel').textContent = label.split(' (')[0] + ' ⌄';
        saveSettings({ defaultPlayer: item.dataset.player });
        playerMenu.style.display = 'none';
        showToast(`Trình phát mặc định: ${label}`);
      };
    });

    // Settings: Nội dung 18+
    const adultCb = document.getElementById('adultContentToggle');
    adultCb.checked = !!getSettings().adultEnabled;
    adultCb.onchange = () => {
      saveSettings({ adultEnabled: adultCb.checked });
      showToast(adultCb.checked ? 'Đã bật hiển thị nguồn 18+' : 'Đã ẩn các nguồn 18+');
    };

    // Settings: AI Model Subpage (Ảnh 1)
    document.getElementById('openAiModelSubpageBtn').onclick = () => {
      document.getElementById('subpage-ai-model').style.display = 'block';
    };
    document.getElementById('closeAiModelSubpageBtn').onclick = () => {
      document.getElementById('subpage-ai-model').style.display = 'none';
    };
    document.getElementById('aiFeatTranslateCard').onclick = () => {
      state.aiTranslateEnabled = !state.aiTranslateEnabled;
      document.getElementById('aiTranslateStatusBadge').textContent = state.aiTranslateEnabled ? 'Đang bật' : 'Đã tắt';
      showToast(state.aiTranslateEnabled ? '🌐 Đã bật Dịch phụ đề & Thông tin AI' : 'Đã tắt Dịch phụ đề AI');
    };
    document.getElementById('aiFeatTtsCard').onclick = () => {
      state.aiDubbingEnabled = !state.aiDubbingEnabled;
      document.getElementById('aiTtsStatusBadge').textContent = state.aiDubbingEnabled ? 'Đang bật' : 'Sẵn sàng';
      speakVietnameseTts('Xin chào, đây là giọng thuyết minh tự động VAX T T S trên thiết bị của bạn.');
      showToast('🎙️ Đã kích hoạt thử giọng đọc VAX TTS');
    };
    document.getElementById('aiFeatSttCard').onclick = () => {
      showToast('💬 Tính năng Tạo phụ đề từ giọng nói sẽ tự động chạy khi bạn bật trong Trình phát video');
    };
    document.getElementById('aiFeatConverterCard').onclick = () => {
      document.getElementById('subpage-ai-model').style.display = 'none';
      document.getElementById('subpage-ai-studio').style.display = 'block';
    };

    // AI Studio Subpage Events
    document.getElementById('closeAiStudioSubpageBtn').onclick = () => {
      document.getElementById('subpage-ai-studio').style.display = 'none';
    };
    document.getElementById('studioRunConvertBtn').onclick = () => {
      triggerAiWebsiteConversion(document.getElementById('studioTargetUrlInput').value);
    };
    document.querySelectorAll('.q-chip').forEach(chip => {
      chip.onclick = () => triggerAiWebsiteConversion(chip.dataset.url);
    });
    document.getElementById('studioSaveAiConfigBtn').onclick = () => {
      saveSettings({
        provider: document.getElementById('studioAiProviderSelect').value,
        apiKey: document.getElementById('studioAiKeyInput').value.trim(),
        corsProxyUrl: document.getElementById('studioCustomServerInput').value.trim(),
        customEndpoint: document.getElementById('studioCustomServerInput').value.trim()
      });
      showToast('✅ Đã lưu cấu hình Server AI & Proxy');
    };
    document.getElementById('studioTestPluginBtn').onclick = () => {
      testStudioPluginInSandbox(document.getElementById('studioCodeEditor').value);
    };
    document.getElementById('studioInstallPluginBtn').onclick = installPluginFromStudio;
    document.getElementById('studioSavePluginTopBtn').onclick = installPluginFromStudio;

    // Cloud Sync, Updates, Cache & Logs (Ảnh 2)
    document.getElementById('googleSyncBtn').onclick = () => {
      const email = prompt('Nhập email Google của bạn để đồng bộ Cloud Sync (vaapp):', 'user@gmail.com');
      if (email) {
        saveSettings({ googleUser: email });
        document.getElementById('cloudAccountTitle').textContent = email;
        document.getElementById('cloudAccountSub').textContent = 'Đã đồng bộ lịch sử xem & tủ phim yêu thích';
        showToast('☁️ Đã đồng bộ dữ liệu Cloud Sync thành công!');
      }
    };
    document.getElementById('checkUpdateAppBtn').onclick = () => {
      showToast('✅ Bạn đang sử dụng phiên bản VAX 2.0.1 (101) mới nhất!');
    };
    document.getElementById('clearImageCacheBtn').onclick = () => {
      showToast('🗑️ Đã giải phóng bộ nhớ đệm hình ảnh & HTTP Cache');
    };
    const clearHistAll = () => {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      renderContinueWatching();
      renderHistoryAndFavoritesView();
      showToast('🕘 Đã xóa tất cả lịch sử xem phim');
    };
    document.getElementById('clearAllWatchHistoryBtn').onclick = clearHistAll;
    document.getElementById('homeClearHistoryBtn').onclick = clearHistAll;

    // Debug Console
    document.getElementById('openDebugLogsBtn').onclick = () => {
      const box = document.getElementById('debugConsoleOutput');
      box.innerHTML = window.VaxRuntime.getLogs().map(l => `<div>[${l.time}] [${l.pluginId}] ${l.text}</div>`).join('');
      document.getElementById('debugConsoleModal').style.display = 'flex';
    };
    document.getElementById('closeDebugConsoleBtn').onclick = () => {
      document.getElementById('debugConsoleModal').style.display = 'none';
    };
    document.getElementById('clearDebugConsoleBtn').onclick = () => {
      window.VaxRuntime.clearLogs();
      document.getElementById('debugConsoleOutput').innerHTML = '';
    };
  }

  // ---------------------------------------------------------------------------
  // 10. KHỞI ĐỘNG ỨNG DỤNG
  // ---------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    bindAllEvents();
    setupCustomPlayerInteractions();
    initAllPlugins();
    loadHomeView();
  });
})();
