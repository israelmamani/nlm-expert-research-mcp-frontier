# Testing

`npm test` ejecuta tests locales deterministas: cache miss, rename/delete, evidence capsule, aislamiento, politica LOCKED, sanitizacion web, recuperacion atomica, transacciones concurrentes, mapeo claim-evidence, autenticacion y 100 investigaciones secuenciales. Las tres pruebas live se omiten salvo que se habiliten explicitamente; `npm run certify:live` nunca las convierte en PASS si faltan credenciales. Live NotebookLM, auth persistence y Claude Desktop requieren interaccion externa.
