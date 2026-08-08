# Troubleshooting

Si Claude no conecta, ejecute `npm run build` y `npm run doctor`, confirme que stdout no recibe logs y habilite logs de Claude Desktop. Si aparece `NOTEBOOK_NOT_FOUND`, el registro intenta live refresh antes de fallar. `BROWSER_TRANSPORT_UNAVAILABLE` significa que el adaptador real no está habilitado, no que la cuenta haya fallado.
