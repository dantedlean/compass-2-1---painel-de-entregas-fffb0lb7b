import { useEffect } from 'react'

/* Raiz do app: serve diretamente o painel de entregas em tela cheia na raiz "/",
   sem redirecionar a barra de endereços (mantendo a URL curta e limpa).
   O Compass 2.0 (workspace de planejamento) continua acessível em /compass-2.
   /painel-entregas.html também permanece acessível diretamente por compatibilidade. */
const Index = () => {
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Entregas por Semana — Dlean'

    // Evita scroll duplo ou scrollbar desnecessária no body
    const prevOverflow = document.body.style.overflow
    const prevMargin = document.body.style.margin
    document.body.style.overflow = 'hidden'
    document.body.style.margin = '0'

    // Polling ativo no iframe para injetar antes e durante a inicialização do DOM
    const interval = setInterval(() => {
      const iframe = document.querySelector('iframe')
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document
          if (doc) injectFixIntoDoc(doc)
        } catch {
          // ignore
        }
      }
    }, 500)

    return () => {
      clearInterval(interval)
      document.title = prevTitle
      document.body.style.overflow = prevOverflow
      document.body.style.margin = prevMargin
    }
  }, [])

  const injectFixIntoDoc = (doc: Document) => {
    try {
      if (!doc.getElementById('fix-paste-script')) {
        const s = doc.createElement('script')
        s.id = 'fix-paste-script'
        s.src = '/painel-fix.js?v=0.1.02'
        doc.head.appendChild(s)
      }
    } catch {
      // ignore
    }
  }

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const iframe = e.currentTarget
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      injectFixIntoDoc(doc)
    } catch {
      // Ignora erro cross-origin se houver
    }
  }

  return (
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-background">
      <iframe
        src="/painel-entregas.html"
        title="Painel de Entregas — Dlean"
        className="w-full h-full border-0 block m-0 p-0"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={handleIframeLoad}
      />
    </div>
  )
}

export default Index
