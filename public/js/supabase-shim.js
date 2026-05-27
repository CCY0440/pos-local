// =============================================
// supabase-shim.js
// 把所有 window.supabaseClient 的呼叫
// 轉換成對本地 Express server 的 REST API 呼叫
// 原本的前端程式碼幾乎不需要修改
// =============================================

(function () {
  const API = window.LOCAL_API_BASE || 'http://localhost:3000';

  // ── Session 管理 ────────────────────────────
  let _token = localStorage.getItem('pos_local_token') || null;
  let _user = JSON.parse(localStorage.getItem('pos_local_user') || 'null');

  function setSession(token, user) {
    _token = token;
    _user = user;
    if (token) {
      localStorage.setItem('pos_local_token', token);
      localStorage.setItem('pos_local_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('pos_local_token');
      localStorage.removeItem('pos_local_user');
    }
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': _token ? `Bearer ${_token}` : '',
        ...(options.headers || {})
      }
    });
    const json = await res.json();
    return json;
  }

  // ── Query Builder ────────────────────────────
  class QueryBuilder {
    constructor(table) {
      this._table = table;
      this._method = 'GET';
      this._filters = {};
      this._body = null;
      this._single = false;
      this._selectCols = null;
    }

    select(cols) {
      this._selectCols = cols;
      return this;
    }
    eq(col, val) { this._filters[`eq_${col}`] = val; return this; }
    neq(col, val) { this._filters[`neq_${col}`] = val; return this; }
    gte(col, val) { this._filters[`gte_${col}`] = val; return this; }
    lte(col, val) { this._filters[`lte_${col}`] = val; return this; }
    gt(col, val) { this._filters[`gt_${col}`] = val; return this; }
    lt(col, val) { this._filters[`lt_${col}`] = val; return this; }
    in(col, vals) { this._filters[`id_in`] = vals.join(','); return this; }
    order(col, opts = {}) { this._filters[`order`] = `${col}:${opts.ascending !== false ? 'asc' : 'desc'}`; return this; }
    limit(n) { this._filters[`limit`] = n; return this; }

    single() { this._single = true; return this; }

    insert(data) {
      this._method = 'POST';
      this._body = data;
      return this;
    }

    update(data) {
      this._method = 'PATCH';
      this._body = data;
      return this;
    }

    upsert(data) {
      this._method = 'POST';
      this._body = data;
      this._upsert = true;
      return this;
    }

    delete() {
      this._method = 'DELETE';
      return this;
    }

    // 把 filter 物件轉成特定路由需要的 query params
    _buildParams() {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(this._filters)) {
        // eq_store_id → store_id=xxx
        if (k.startsWith('eq_')) {
          params.set(k.replace('eq_', ''), v);
        } else {
          params.set(k, v);
        }
      }
      return params.toString();
    }

    then(resolve, reject) {
      return this._run().then(resolve, reject);
    }
    catch(fn) { return this._run().catch(fn); }
    finally(fn) { return this._run().finally(fn); }

    async _run() {
      const table = this._table;
      const qs = this._buildParams();

      // ── GET ──────────────────────────────────
      if (this._method === 'GET') {
        // 單筆 by ID (eq_id 單獨處理)
        const idVal = this._filters['eq_id'];
        if (idVal && this._single) {
          const json = await apiFetch(`/api/${table}/${idVal}`);
          return json;
        }
        const json = await apiFetch(`/api/${table}?${qs}`);
        if (this._single) {
          return { data: Array.isArray(json.data) ? json.data[0] || null : json.data, error: json.error };
        }
        return json;
      }

      // ── POST (insert) ─────────────────────────
      if (this._method === 'POST') {
        const json = await apiFetch(`/api/${table}`, {
          method: 'POST',
          body: JSON.stringify(this._body)
        });
        if (this._single) {
          return { data: Array.isArray(json.data) ? json.data[0] : json.data, error: json.error };
        }
        return json;
      }

      // ── PATCH (update) ─────────────────────────
      if (this._method === 'PATCH') {
        const idVal = this._filters['eq_id'];
        if (idVal) {
          const json = await apiFetch(`/api/${table}/${idVal}`, {
            method: 'PATCH',
            body: JSON.stringify(this._body)
          });
          return json;
        }
        // stores 更新 (by owner, 沒有 id)
        if (table === 'stores') {
          const json = await apiFetch(`/api/stores/me`, {
            method: 'PATCH',
            body: JSON.stringify({ filters: this._filters, data: this._body })
          });
          return json;
        }
        // 通用更新
        const json = await apiFetch(`/api/${table}?${qs}`, {
          method: 'PATCH',
          body: JSON.stringify(this._body)
        });
        return json;
      }

      // ── DELETE ───────────────────────────────
      if (this._method === 'DELETE') {
        const idVal = this._filters['eq_id'];
        if (idVal) {
          const json = await apiFetch(`/api/${table}/${idVal}`, { method: 'DELETE' });
          return json;
        }
        const json = await apiFetch(`/api/${table}?${qs}`, { method: 'DELETE' });
        return json;
      }
    }
  }

  // ── Realtime Channel ──────────────────────────
  class RealtimeChannel {
    constructor(name) {
      this._name = name;
      this._handlers = [];
      this._es = null;
    }

    on(event, config, callback) {
      this._handlers.push({ event, config, callback });
      return this;
    }

    subscribe() {
      // 從 filter 抓出 store_id
      let storeId = null;
      for (const h of this._handlers) {
        const m = (h.config?.filter || '').match(/store_id=eq\.(.+)/);
        if (m) { storeId = m[1]; break; }
      }
      if (!storeId) return this;

      const url = `${API}/api/realtime/events?store_id=${storeId}&token=${_token || ''}`;
      this._es = new EventSource(url);

      this._es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === 'connected') return;

          this._handlers.forEach(h => {
            const matchEvent = h.config?.event === payload.event || h.config?.event === '*';
            const matchTable = h.config?.table === payload.table;
            if (matchEvent && matchTable) {
              h.callback({ new: payload.new, old: payload.old, eventType: payload.event });
            }
          });
        } catch (err) { }
      };

      this._es.onerror = () => {
        // 重連
        setTimeout(() => {
          if (this._es) {
            this._es.close();
            this.subscribe();
          }
        }, 1000);
      };

      return this;
    }

    unsubscribe() {
      if (this._es) {
        this._es.close();
        this._es = null;
      }
    }
  }

  // ── Storage ────────────────────────────────────
  class StorageBucket {
    constructor(bucket) { this._bucket = bucket; }

    async upload(filePath, file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filePath', filePath);

      const res = await fetch(`${API}/storage/${this._bucket}`, {
        method: 'POST',
        headers: { 'Authorization': _token ? `Bearer ${_token}` : '' },
        body: formData
      });
      return await res.json();
    }

    getPublicUrl(path) {
      return {
        data: {
          publicUrl: `/uploads/${path}`
        }
      };
    }

    async remove(paths) {
      const json = await apiFetch(`/storage/${this._bucket}`, {
        method: 'DELETE',
        body: JSON.stringify({ paths })
      });
      return json;
    }
  }

  // ── 主要的 supabaseClient 物件 ─────────────────
  window.supabaseClient = {

    from(table) {
      const tableMap = { 'tables': 'tables' };
      return new QueryBuilder(tableMap[table] || table);
    },

    auth: {
      async getUser() {
        if (_user) return { data: { user: _user }, error: null };
        if (_token) {
          try {
            const res = await fetch(`${API}/auth/user`, {
              headers: { 'Authorization': `Bearer ${_token}` }
            });
            const json = await res.json();
            if (json.data?.user) {
              _user = json.data.user;
              localStorage.setItem('pos_local_user', JSON.stringify(_user));
            }
            return json;
          } catch (e) { }
        }
        return { data: { user: null }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const json = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        if (!json.error && json.data?.session) {
          setSession(json.data.session.access_token, json.data.user);
        }
        if (json.error) json.error = { message: json.error };
        return json;
      },

      async signUp({ email, password }, storeName) {
        const json = await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, storeName })
        });
        if (!json.error && json.data?.session) {
          setSession(json.data.session.access_token, json.data.user);
        }
        if (json.error) json.error = { message: json.error };
        return json;
      },

      async signOut() {
        await apiFetch('/auth/logout', { method: 'POST' });
        setSession(null, null);
        return { error: null };
      },

      async updateUser({ password }) {
        const json = await apiFetch('/auth/update-password', {
          method: 'POST',
          body: JSON.stringify({ password })
        });
        return json;
      },

      onAuthStateChange(callback) {
        // 本地版不需要，回傳假的 subscription
        return { data: { subscription: { unsubscribe: () => { } } } };
      },

      // 忘記密碼 → 本地版改成提示訊息
      async resetPasswordForEmail(email) {
        return { error: { message: '本地版無法寄信，請直接在設定頁修改密碼。' } };
      }
    },

    channel(name) {
      return new RealtimeChannel(name);
    },

    storage: {
      from(bucket) {
        return new StorageBucket(bucket);
      }
    }
  };

  // ── 圖片網址轉換 ──────────────────────────────
  window.getSupabaseImageUrl = function (path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    if (path.startsWith('/uploads/')) return path;
    return `/uploads/${path}`;
  };

  console.log('✅ 本地 API shim 已載入，連線至:', API);
})();
