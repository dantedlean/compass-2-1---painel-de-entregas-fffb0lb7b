// ==============================================================================
// painel-progexec.js — Sincronização da Programação Firme (Exec. e Realizada)
// Salva localmente (cache imediato) e sincroniza com PocketBase (coleção andon_progexec)
// Reconciliação com last-write-wins (timestamp de revisão), polling de 60s,
// sincronização ao focar a janela e push de registros históricos pré-existentes.
// ==============================================================================
(function () {
  'use strict';

  // Chave de revisão local: 'progexec_rev|' + cod + '|' + dia
  function revKey(cod, dia) {
    return 'progexec_rev|' + cod + '|' + dia;
  }

  function getLocalRev(cod, dia) {
    var val = localStorage.getItem(revKey(cod, dia));
    var n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  function setLocalRev(cod, dia, rev) {
    try {
      localStorage.setItem(revKey(cod, dia), String(rev || Date.now()));
    } catch (e) {}
  }

  // Resolve a URL base da API PocketBase
  function getApiBase() {
    if (window.ANDON_SYNC && window.ANDON_SYNC.api) {
      return window.ANDON_SYNC.api;
    }
    if (typeof HH_API !== 'undefined' && HH_API) {
      return HH_API;
    }
    return 'https://painel-entregas-semanais-708f0.shrd00.internal.goskip.dev';
  }

  function getAuthToken() {
    if (window.ANDON_SYNC && typeof window.ANDON_SYNC.token === 'string') {
      return window.ANDON_SYNC.token;
    }
    return localStorage.getItem('andon|token') || '';
  }

  function isAdmin() {
    var uv = '';
    try {
      uv = (JSON.parse(localStorage.getItem('andon|user') || '{}').role) || '';
    } catch (e) {}
    if (!uv && (localStorage.getItem('andon|token') || '')) uv = 'admin';
    return uv === 'admin' && !document.body.classList.contains('viewerMode');
  }

  function getCurrentUserIdent() {
    try {
      var u = JSON.parse(localStorage.getItem('andon|user') || '{}');
      return u.name || u.email || 'admin';
    } catch (e) {
      return 'admin';
    }
  }

  // Filas e debounces para evitar rajadas de escrita no servidor
  var _pendingPush = {};
  var _pushTimer = null;
  var _syncBusy = false;

  // Envia registro pendente ao servidor
  async function pushRecordToServer(dia, codigo, valObj, rev) {
    var token = getAuthToken();
    if (!token || !isAdmin()) return false;

    var api = getApiBase();
    var filter = "(dia='" + encodeURIComponent(dia) + "' && codigo='" + encodeURIComponent(codigo) + "')";
    var headers = {
      'Authorization': token,
      'Content-Type': 'application/json'
    };

    var qtd = (valObj && typeof valObj.qtd === 'number') ? valObj.qtd : (valObj && parseFloat(valObj.qtd)) || 0;
    var execOk = !!(valObj && valObj.ok);
    var bodyPayload = {
      dia: String(dia),
      codigo: String(codigo),
      valor: qtd,
      exec_ok: execOk,
      dados: valObj || null,
      revisao: rev || Date.now(),
      atualizado_em: new Date().toISOString(),
      criado_por: getCurrentUserIdent()
    };

    try {
      // 1. Verificar se registro já existe no backend
      var searchUrl = api + '/api/collections/andon_progexec/records?filter=' + encodeURIComponent(filter) + '&perPage=1';
      var res = await fetch(searchUrl, { headers: headers });
      if (res.status === 401 || res.status === 403) {
        if (window.ANDON_SYNC && window.ANDON_SYNC._authFail) {
          window.ANDON_SYNC._authFail();
        }
        return false;
      }
      if (!res.ok) return false;

      var data = await res.json();
      var existing = data.items && data.items.length ? data.items[0] : null;

      if (existing) {
        // Se o servidor for mais novo, não sobrescrever
        var srvRev = Number(existing.revisao || 0);
        if (srvRev > bodyPayload.revisao) {
          return false;
        }
        var updateUrl = api + '/api/collections/andon_progexec/records/' + existing.id;
        var upRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify(bodyPayload)
        });
        return upRes.ok;
      } else {
        var createUrl = api + '/api/collections/andon_progexec/records';
        var crRes = await fetch(createUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(bodyPayload)
        });
        return crRes.ok;
      }
    } catch (err) {
      console.warn('[painel-progexec] pushRecordToServer erro:', err);
      return false;
    }
  }

  function queuePush(dia, codigo, valObj) {
    var k = dia + '|' + codigo;
    var rev = Date.now();
    setLocalRev(codigo, dia, rev);
    _pendingPush[k] = { dia: dia, codigo: codigo, valObj: valObj, rev: rev };

    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(flushPendingPushes, 400);
  }

  async function flushPendingPushes() {
    var entries = Object.keys(_pendingPush).map(function (k) { return _pendingPush[k]; });
    _pendingPush = {};
    if (!entries.length) return;

    for (var i = 0; i < entries.length; i++) {
      var item = entries[i];
      await pushRecordToServer(item.dia, item.codigo, item.valObj, item.rev);
    }
  }

  // Interceptar setProgExec (mantém original em cache local e aciona push)
  var _origSetProgExec = window.setProgExec;
  window._origSetProgExec = _origSetProgExec;

  window.setProgExec = function (cod, dia, v) {
    if (typeof _origSetProgExec === 'function') {
      _origSetProgExec(cod, dia, v);
    } else {
      var k = 'prog|' + cod + '|' + dia;
      if (v && (v.ok || v.qtd || v.rl || v.pvNovo || v.smkt)) {
        localStorage.setItem(k, JSON.stringify(v));
      } else {
        localStorage.removeItem(k);
      }
    }

    try {
      queuePush(dia, cod, v);
    } catch (e) {
      console.warn('[painel-progexec] queuePush erro:', e);
    }
  };

  // Coleta os dias atualmente em exibição/na agenda
  function getDiasAlvo() {
    var diasSet = new Set();
    if (typeof progDate === 'string' && progDate) diasSet.add(progDate);

    if (typeof diasDaVista === 'function') {
      try {
        var dv = diasDaVista();
        if (Array.isArray(dv)) {
          dv.forEach(function (x) {
            if (x && x.data) diasSet.add(x.data);
          });
        }
      } catch (e) {}
    }

    if (window.DATA && window.DATA.progSemana && Array.isArray(window.DATA.progSemana.dias)) {
      window.DATA.progSemana.dias.forEach(function (d) {
        if (d && d.data) diasSet.add(d.data);
      });
    }

    return Array.from(diasSet);
  }

  // Reconciliação a partir do servidor
  async function syncProgExecFromServer() {
    if (_syncBusy) return false;
    _syncBusy = true;
    try {
      var api = getApiBase();
      var dias = getDiasAlvo();
      if (!dias.length) return false;

      // Monta filtro por dias
      var filterParts = dias.map(function (d) { return "dia='" + encodeURIComponent(d) + "'"; });
      var filter = '(' + filterParts.join(' || ') + ')';
      var url = api + '/api/collections/andon_progexec/records?filter=' + encodeURIComponent(filter) + '&perPage=200';

      var headers = {};
      var token = getAuthToken();
      if (token) headers['Authorization'] = token;

      var res = await fetch(url, { headers: headers });
      if (!res.ok) return false;

      var data = await res.json();
      var items = data.items || [];
      var changed = false;

      var serverRecordsKeyMap = {};

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var d = it.dia;
        var c = it.codigo;
        serverRecordsKeyMap[d + '|' + c] = true;

        var srvRev = Number(it.revisao || 0);
        var locRev = getLocalRev(c, d);

        var locVal = (typeof window.getProgExec === 'function')
          ? window.getProgExec(c, d)
          : (function () {
              try { return JSON.parse(localStorage.getItem('prog|' + c + '|' + d) || 'null'); } catch (e) { return null; }
            })();

        // Se servidor é mais recente ou local não existe
        if (!locVal || srvRev >= locRev) {
          var newVal = it.dados || { ok: !!it.exec_ok, qtd: Number(it.valor) || 0 };
          var locStr = JSON.stringify(locVal || null);
          var srvStr = JSON.stringify(newVal || null);

          if (locStr !== srvStr) {
            if (typeof _origSetProgExec === 'function') {
              _origSetProgExec(c, d, newVal);
            } else {
              var k = 'prog|' + c + '|' + d;
              if (newVal && (newVal.ok || newVal.qtd || newVal.rl || newVal.pvNovo || newVal.smkt)) {
                localStorage.setItem(k, JSON.stringify(newVal));
              } else {
                localStorage.removeItem(k);
              }
            }
            setLocalRev(c, d, srvRev || Date.now());
            changed = true;
          }
        } else if (isAdmin() && locRev > srvRev && locVal) {
          // Local mais recente em máquina admin: enviar ao servidor
          queuePush(d, c, locVal);
        }
      }

      // Primeira sincronização: dados locais do admin que ainda NÃO estão no servidor
      if (isAdmin()) {
        dias.forEach(function (d) {
          if (window.DATA && window.DATA.progSemana && Array.isArray(window.DATA.progSemana.dias)) {
            window.DATA.progSemana.dias.forEach(function (a) {
              if (a.data === d && a.cod) {
                var sk = d + '|' + a.cod;
                if (!serverRecordsKeyMap[sk]) {
                  var lv = (typeof window.getProgExec === 'function') ? window.getProgExec(a.cod, d) : null;
                  if (lv && (lv.ok || lv.qtd || lv.rl || lv.pvNovo || lv.smkt)) {
                    queuePush(d, a.cod, lv);
                  }
                }
              }
            });
          }
        });
      }

      if (changed) {
        if (typeof window.renderProgTabela === 'function') {
          try { window.renderProgTabela(); } catch (e) {}
        }
        if (typeof window.updHojeProg === 'function') {
          try { window.updHojeProg(); } catch (e) {}
        }
      }
      return changed;
    } catch (err) {
      console.warn('[painel-progexec] syncProgExecFromServer erro:', err);
      return false;
    } finally {
      _syncBusy = false;
    }
  }

  // Executar sincronização inicial assim que carregar
  setTimeout(function () {
    syncProgExecFromServer();
  }, 1200);

  // Polling a cada 60s
  setInterval(function () {
    syncProgExecFromServer();
  }, 60000);

  // Sincronização ao focar ou reativar aba
  function onFocusSync() {
    syncProgExecFromServer();
  }
  window.addEventListener('focus', onFocusSync);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) onFocusSync();
  });

  // Exportar utilitário global para testes/manual
  window.ANDON_PROGEXEC = {
    sync: syncProgExecFromServer,
    flush: flushPendingPushes,
    push: pushRecordToServer,
    getApiBase: getApiBase
  };
})();
