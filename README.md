# The Daily Spread

Els mercats del món, abans que obrin. Web estàtica: `index.html` + `ledger-runtime.js`, amb les dades del dia a `data/`.

Les dades les actualitza cada matí a les 6:33 (hora de Madrid) una tasca programada de Claude, que fa un commit nou a `data/`. Vercel publica cada commit automàticament.

El cercador d'accions fa servir la clau gratuïta d'Alpha Vantage de cada visitant, que només es guarda al seu navegador.
