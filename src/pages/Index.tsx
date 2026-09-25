import { useEffect } from 'react'

/* Raiz do app: redireciona para o painel de entregas (estático em /painel-entregas.html).
   O Compass 2.0 (workspace de planejamento) continua em /compass-2. */
const Index = () => {
  useEffect(() => {
    window.location.replace('/painel-entregas.html')
  }, [])

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Painel de Entregas</h1>
      <p className="text-muted-foreground">
        Abrindo o painel… se nada acontecer, use{' '}
        <a className="underline text-blue-600" href="/painel-entregas.html">
          /painel-entregas.html
        </a>
      </p>
    </div>
  )
}

export default Index
