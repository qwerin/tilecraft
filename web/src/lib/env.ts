// Testovací instance (server s TILECRAFT_ENV=test označí <html data-env="test">, vývoj ve Vite vždy):
// růžový motiv (index.css), štítek TEST u loga a „TEST ·“ v titulku, aby se nepletla s produkcí.
if (import.meta.env.DEV) document.documentElement.dataset.env = 'test'

export const isTestEnv = document.documentElement.dataset.env === 'test'

if (isTestEnv) document.title = `TEST · ${document.title}`
