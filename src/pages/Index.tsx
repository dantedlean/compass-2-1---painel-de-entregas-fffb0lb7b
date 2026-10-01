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

    return () => {
      document.title = prevTitle
      document.body.style.overflow = prevOverflow
      document.body.style.margin = prevMargin
    }
  }, [])

  return (
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-background">
      <iframe
        src="/painel-entregas.html"
        title="Painel de Entregas — Dlean"
        className="w-full h-full border-0 block m-0 p-0"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  )
}

export default Index
