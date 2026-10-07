// Fix para colar (Ctrl+V) no login e ajustes de versão no painel-entregas.html
// Injetado transparentemente para garantir que os campos de login (e-mail e senha)
// aceitem colagem, digitação e preenchimento automático sem interferência de listeners globais.

(function () {
  function fixLoginPaste() {
    const connEmail = document.getElementById('connEmail')
    const connPass = document.getElementById('connPass')

    if (connEmail) {
      connEmail.setAttribute('autocomplete', 'username')
      connEmail.setAttribute('name', 'username')
      connEmail.style.userSelect = 'text'
      connEmail.style.webkitUserSelect = 'text'
      connEmail.addEventListener('paste', function (e) {
        e.stopPropagation()
      }, true)
      connEmail.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
          e.stopPropagation()
        }
      }, true)
    }

    if (connPass) {
      connPass.setAttribute('autocomplete', 'current-password')
      connPass.setAttribute('name', 'password')
      connPass.style.userSelect = 'text'
      connPass.style.webkitUserSelect = 'text'
      connPass.addEventListener('paste', function (e) {
        e.stopPropagation()
      }, true)
      connPass.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
          e.stopPropagation()
        }
      }, true)
    }

    // Atualiza versão no cabeçalho e rodapés das views
    const verBadge = document.getElementById('panelVersionBadge')
    if (verBadge) {
      verBadge.textContent = 'v0.1.02'
    } else {
      const headerSub = document.querySelector('header .sub')
      if (headerSub && !headerSub.querySelector('.version-tag')) {
        const span = document.createElement('span')
        span.id = 'panelVersionBadge'
        span.className = 'version-tag'
        span.style.cssText = 'margin-left:8px;font-weight:700;color:#3b82f6;'
        span.textContent = 'v0.1.02'
        headerSub.appendChild(span)
      }
    }

    // Rodapés das views
    document.querySelectorAll('footer').forEach(function (f) {
      if (!f.getAttribute('data-ver-updated')) {
        f.setAttribute('data-ver-updated', 'true')
        f.innerHTML = f.innerHTML.trim() + ' · <b style="color:var(--acc, #1e3a8a)">v0.1.02</b>'
      }
    })
  }

  // Interceptador na fase de captura global para garantir que QUALQUER campo de texto/senha ignore atalhos globais de colagem
  window.addEventListener(
    'keydown',
    function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        const t = e.target
        const act = document.activeElement
        const isInput =
          (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) ||
          (act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA' || act.isContentEditable))
        if (isInput) {
          // Permite ação nativa do navegador
          e.stopPropagation()
        }
      }
    },
    true
  )

  window.addEventListener(
    'paste',
    function (e) {
      const t = e.target
      const act = document.activeElement
      const isInput =
        (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) ||
        (act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA' || act.isContentEditable))
      if (isInput) {
        e.stopPropagation()
      }
    },
    true
  )

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixLoginPaste)
  } else {
    fixLoginPaste()
  }

  // Monitora caso os elementos sejam recriados ou inseridos dinamicamente
  setInterval(fixLoginPaste, 1500)
})()
