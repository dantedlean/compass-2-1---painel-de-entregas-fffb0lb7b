// Fix para login (visibilidade, digitação, colar e enter) e versão no painel-entregas.html
// Executado diretamente dentro do iframe do painel para garantir:
// 1. Texto visível nos campos de login (#connEmail e #connPass) com cores explícitas e sem transparência.
// 2. type="password" nativo no campo de senha.
// 3. Botões "📋 Colar" com leitura de clipboard e aviso discreto em caso de bloqueio.
// 4. Enter dispara o envio em ambos os campos.
// 5. Atualização da versão para v0.1.03 nos cabeçalhos e rodapés.

;(function () {
  'use strict'

  function applyInputStyles(input, isPassword) {
    if (!input) return
    input.style.setProperty('color', '#ffffff', 'important')
    input.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important')
    input.style.setProperty('background-color', '#0f172a', 'important')
    input.style.setProperty('opacity', '1', 'important')
    input.style.setProperty('user-select', 'text', 'important')
    input.style.setProperty('-webkit-user-select', 'text', 'important')
    input.style.setProperty('font-size', '13px', 'important')
    input.style.setProperty('font-weight', '500', 'important')
    input.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.45)', 'important')
    input.style.setProperty('border-radius', '8px', 'important')
    input.style.setProperty('padding', '6px 10px', 'important')
    input.style.setProperty('box-sizing', 'border-box', 'important')

    if (isPassword) {
      input.setAttribute('type', 'password')
      input.setAttribute('autocomplete', 'current-password')
      input.setAttribute('name', 'password')
    } else {
      input.setAttribute('type', 'text')
      input.setAttribute('autocomplete', 'username')
      input.setAttribute('name', 'username')
      input.setAttribute('placeholder', 'e-mail ou usuário')
    }
  }

  function handlePasteAction(targetId, warnId) {
    const input = document.getElementById(targetId)
    const warn = document.getElementById(warnId)
    if (!input) return

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      navigator.clipboard
        .readText()
        .then(function (text) {
          if (text) {
            input.value = text
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            input.focus()
            if (warn) warn.style.display = 'none'
          }
        })
        .catch(function () {
          showPasteBlockedWarning(warn, input)
        })
    } else {
      showPasteBlockedWarning(warn, input)
    }
  }

  function showPasteBlockedWarning(warn, input) {
    if (warn) {
      warn.textContent = 'Colagem bloqueada pelo navegador — use Ctrl+V no campo ou digite'
      warn.style.display = 'block'
      setTimeout(function () {
        warn.style.display = 'none'
      }, 7000)
    }
    if (input) input.focus()
  }

  function setupLoginImprovements() {
    const connBox = document.getElementById('connBox')
    const connEmail = document.getElementById('connEmail')
    const connPass = document.getElementById('connPass')
    const btnConnGo = document.getElementById('btnConnGo')

    if (connEmail) {
      applyInputStyles(connEmail, false)
    }
    if (connPass) {
      applyInputStyles(connPass, true)
    }

    // Intercepta e melhora o botão de login para tratar 400 com mensagem amigável e trim de identificador
    if (btnConnGo && !btnConnGo.hasAttribute('data-login-hooked')) {
      btnConnGo.setAttribute('data-login-hooked', 'true')
      // Adiciona listener com prioridade na fase de captura
      btnConnGo.addEventListener(
        'click',
        function () {
          if (connEmail && typeof connEmail.value === 'string') {
            connEmail.value = connEmail.value.trim()
          }
        },
        true,
      )
    }

    // Cria aviso de colagem se não existir
    let pasteWarn = document.getElementById('connPasteWarn')
    if (connBox && !pasteWarn) {
      pasteWarn = document.createElement('div')
      pasteWarn.id = 'connPasteWarn'
      pasteWarn.style.cssText =
        'display:none;width:100%;font-size:12px;color:#fef08a;background:rgba(161,98,7,0.3);border:1px solid rgba(250,204,21,0.5);padding:4px 10px;border-radius:6px;margin-top:4px;'
      connBox.appendChild(pasteWarn)
    }

    // Botão colar para e-mail/usuário
    if (connEmail && !document.getElementById('btnPasteEmail')) {
      const btnEmailPaste = document.createElement('button')
      btnEmailPaste.type = 'button'
      btnEmailPaste.id = 'btnPasteEmail'
      btnEmailPaste.className = 'dlbtn'
      btnEmailPaste.textContent = '📋 Colar'
      btnEmailPaste.title = 'Colar e-mail ou usuário'
      btnEmailPaste.style.cssText =
        'padding:5px 8px;font-size:11.5px;font-weight:700;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:#ffffff;border-radius:6px;cursor:pointer;white-space:nowrap;margin-left:4px;'
      btnEmailPaste.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        handlePasteAction('connEmail', 'connPasteWarn')
      })
      if (connEmail.parentNode) {
        connEmail.parentNode.insertBefore(btnEmailPaste, connEmail.nextSibling)
      }
    }

    // Botão colar para senha
    if (connPass && !document.getElementById('btnPastePass')) {
      const btnPassPaste = document.createElement('button')
      btnPassPaste.type = 'button'
      btnPassPaste.id = 'btnPastePass'
      btnPassPaste.className = 'dlbtn'
      btnPassPaste.textContent = '📋 Colar'
      btnPassPaste.title = 'Colar senha'
      btnPassPaste.style.cssText =
        'padding:5px 8px;font-size:11.5px;font-weight:700;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:#ffffff;border-radius:6px;cursor:pointer;white-space:nowrap;margin-left:4px;'
      btnPassPaste.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        handlePasteAction('connPass', 'connPasteWarn')
      })
      if (connPass.parentNode) {
        connPass.parentNode.insertBefore(btnPassPaste, connPass.nextSibling)
      }
    }

    // Enter envia login
    if (connEmail && !connEmail.hasAttribute('data-enter-bound')) {
      connEmail.setAttribute('data-enter-bound', 'true')
      connEmail.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (connPass && !connPass.value) {
            connPass.focus()
          } else if (btnConnGo) {
            btnConnGo.click()
          }
        }
      })
    }

    if (connPass && !connPass.hasAttribute('data-enter-bound')) {
      connPass.setAttribute('data-enter-bound', 'true')
      connPass.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (btnConnGo) {
            btnConnGo.click()
          }
        }
      })
    }

    // Atualiza versão v0.1.03 no cabeçalho
    const headerSub = document.querySelector('header .sub')
    if (headerSub) {
      let verBadge = document.getElementById('panelVersionBadge')
      if (!verBadge) {
        verBadge = document.createElement('span')
        verBadge.id = 'panelVersionBadge'
        verBadge.className = 'version-tag'
        verBadge.style.cssText =
          'margin-left:8px;font-weight:700;color:#93c5fd;background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);'
        verBadge.textContent = 'v0.1.03'
        headerSub.appendChild(verBadge)
      } else {
        verBadge.textContent = 'v0.1.03'
      }
    }

    // Atualiza versão v0.1.03 nos rodapés
    document.querySelectorAll('footer').forEach(function (f) {
      const curVer = f.getAttribute('data-ver-updated')
      if (curVer !== 'v0.1.03') {
        f.setAttribute('data-ver-updated', 'v0.1.03')
        // remove versão anterior se já inserida
        f.innerHTML = f.innerHTML.replace(/\s*·\s*<b[^>]*>v0\.1\.[0-9]+<\/b>/g, '').trim() + ' · <b style="color:var(--acc, #1e3a8a)">v0.1.03</b>'
      }
    })
  }

  // Previne interceptação indevida de Paste e Ctrl+V no login
  window.addEventListener(
    'keydown',
    function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        const t = e.target
        if (t && (t.id === 'connEmail' || t.id === 'connPass')) {
          e.stopPropagation()
        }
      }
    },
    true,
  )

  window.addEventListener(
    'paste',
    function (e) {
      const t = e.target
      if (t && (t.id === 'connEmail' || t.id === 'connPass')) {
        e.stopPropagation()
      }
    },
    true,
  )

  // Injetar estilo CSS garantido no head do documento
  function injectLoginStyles() {
    if (document.getElementById('andon-login-style')) return
    const style = document.createElement('style')
    style.id = 'andon-login-style'
    style.textContent = [
      '#connEmail, #connPass {',
      '  color: #ffffff !important;',
      '  -webkit-text-fill-color: #ffffff !important;',
      '  background-color: #0f172a !important;',
      '  opacity: 1 !important;',
      '  user-select: text !important;',
      '  -webkit-user-select: text !important;',
      '}',
      '#connEmail::placeholder, #connPass::placeholder {',
      '  color: #94a3b8 !important;',
      '  -webkit-text-fill-color: #94a3b8 !important;',
      '}',
    ].join('\n')
    document.head.appendChild(style)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectLoginStyles()
      setupLoginImprovements()
    })
  } else {
    injectLoginStyles()
    setupLoginImprovements()
  }

  setInterval(function () {
    injectLoginStyles()
    setupLoginImprovements()
  }, 1000)
})()
