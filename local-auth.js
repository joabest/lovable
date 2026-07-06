(function installLocalAuth(){
  if (globalThis.__hawkLocalAuthInstalled) return;
  globalThis.__hawkLocalAuthInstalled = true;

  const DEFAULT_EMAIL = "admin@admin.com";
  const SESSION_DURATION_MS = 60 * 60 * 1000;
  const BACKEND_HOSTS = new Set([
    "hawksystem.com.br",
    "hawksystem-api.onrender.com",
    "hawksystem-api.fly.dev"
  ]);

  function expiresAt(){
    return new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  }

  function getEmail(candidate){
    const value = String(candidate || "").trim();
    return value || DEFAULT_EMAIL;
  }

  function localSession(email){
    const userEmail = getEmail(email);
    const exp = expiresAt();
    const token = `local-session:${userEmail}:${Date.now()}`;
    return {
      email: userEmail,
      name: userEmail,
      access_token: token,
      refresh_token: `local-refresh:${userEmail}`,
      session_token: token,
      session_id: token,
      license_key: `LOCAL-${userEmail}`,
      license_type: "local",
      status: "active",
      expires_at: exp,
      lifetime: false,
      valid: true,
      max_devices: 1,
      devices_count: 1,
      user: { email: userEmail, name: userEmail, role: "admin" }
    };
  }

  function storagePayload(email){
    const session = localSession(email);
    return {
      hawk_access_token: session.access_token,
      hawk_refresh_token: session.refresh_token,
      hawk_user: session.user,
      hawk_session_token: session.session_token,
      hawk_license: {
        license_key: session.license_key,
        license_type: session.license_type,
        status: session.status,
        expires_at: session.expires_at,
        devices_count: session.devices_count,
        max_devices: session.max_devices,
        user_name: session.name
      },
      ql_license_valid: true,
      ql_license_key: session.license_key,
      ql_session_id: session.session_token,
      ql_user_name: session.name,
      ql_expires_at: session.expires_at,
      ql_activated_at: new Date().toISOString(),
      ql_license_status: session.status,
      ql_license_type: session.license_type,
      ql_license_lifetime: false,
      ts_session_token: session.session_token,
      ts_session_expires_at: session.expires_at
    };
  }

  function persistLocalSession(email){
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(storagePayload(email));
      }
    } catch (error) {
      console.warn("[LocalAuth] Falha ao gravar sessão local:", error && error.message || error);
    }
  }

  function jsonResponse(data, init){
    return new Response(JSON.stringify(data), {
      status: init && init.status || 200,
      statusText: init && init.statusText || "OK",
      headers: { "Content-Type": "application/json" }
    });
  }

  async function readBodyEmail(init){
    try {
      if (!init || !init.body) return DEFAULT_EMAIL;
      const raw = typeof init.body === "string" ? init.body : await new Response(init.body).text();
      const body = JSON.parse(raw || "{}");
      return getEmail(body.email || body.user_email || body.login);
    } catch (_) {
      return DEFAULT_EMAIL;
    }
  }

  const nativeFetch = globalThis.fetch && globalThis.fetch.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = async function localAuthFetch(input, init){
      const url = typeof input === "string" ? input : input && input.url;
      let parsed;
      try { parsed = new URL(url); } catch (_) { parsed = null; }

      if (parsed && BACKEND_HOSTS.has(parsed.hostname)) {
        const path = parsed.pathname;
        if (path.startsWith("/auth/") || path.startsWith("/license/") || path === "/trial/activate") {
          const email = await readBodyEmail(init);
          const session = localSession(email);
          persistLocalSession(email);

          if (path === "/auth/me") return jsonResponse(session.user);
          if (path === "/auth/refresh") return jsonResponse({ access_token: session.access_token, refresh_token: session.refresh_token });
          if (path === "/license/heartbeat") return jsonResponse({ ...session, message: "Sessão local ativa por 1 hora." });
          return jsonResponse(session);
        }
      }

      return nativeFetch(input, init);
    };
  }

  function prepareEmailOnlyForm(){
    const emailInputs = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]'));
    emailInputs.forEach(input => {
      if (!input.value) input.value = DEFAULT_EMAIL;
      input.placeholder = DEFAULT_EMAIL;
    });

    Array.from(document.querySelectorAll('input[type="password"], input[name*="password" i], input[id*="password" i]')).forEach(input => {
      input.value = "local-auth";
      const field = input.closest("label, .sp-field, .ql-field, div") || input;
      field.style.display = "none";
      input.removeAttribute("required");
    });
  }

  persistLocalSession(DEFAULT_EMAIL);
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", prepareEmailOnlyForm, { once: true });
    } else {
      prepareEmailOnlyForm();
    }
    new MutationObserver(prepareEmailOnlyForm).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
